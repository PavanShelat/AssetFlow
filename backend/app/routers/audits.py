from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.config import get_supabase
from app.routers.auth import get_current_user

router = APIRouter()


class AuditCycleCreate(BaseModel):
    name: str
    department_id: Optional[str] = None
    location: Optional[str] = None
    start_date: str
    end_date: str
    auditor_ids: List[str] = []
    notes: Optional[str] = None


class AuditItemUpdate(BaseModel):
    verification_status: str  # verified, missing, damaged
    notes: Optional[str] = None


@router.get("")
def list_audit_cycles(
    status: Optional[str] = None,
    authorization: str = Header(None)
):
    """List all audit cycles."""
    user = get_current_user(authorization)
    sb = get_supabase()

    query = sb.table("audit_cycles").select(
        "*, department:departments(id, name), created_by_profile:profiles!audit_cycles_created_by_fkey(id, full_name)"
    )

    if status:
        query = query.eq("status", status)

    result = query.order("created_at", desc=True).execute()

    # For each cycle, get auditor names
    cycles = []
    for cycle in result.data:
        assignments = sb.table("audit_assignments").select(
            "*, auditor:profiles!audit_assignments_auditor_id_fkey(id, full_name)"
        ).eq("audit_cycle_id", cycle["id"]).execute()

        cycle["auditors"] = [a.get("auditor", {}) for a in assignments.data]
        cycles.append(cycle)

    return {"cycles": cycles}


@router.get("/{cycle_id}")
def get_audit_cycle(cycle_id: str, authorization: str = Header(None)):
    """Get audit cycle details with all items."""
    user = get_current_user(authorization)
    sb = get_supabase()

    cycle = sb.table("audit_cycles").select(
        "*, department:departments(id, name)"
    ).eq("id", cycle_id).single().execute()

    if not cycle.data:
        raise HTTPException(status_code=404, detail="Audit cycle not found")

    # Get auditors
    assignments = sb.table("audit_assignments").select(
        "*, auditor:profiles!audit_assignments_auditor_id_fkey(id, full_name)"
    ).eq("audit_cycle_id", cycle_id).execute()

    # Get items
    items = sb.table("audit_items").select(
        "*, asset:assets(id, tag, name)"
    ).eq("audit_cycle_id", cycle_id).execute()

    # Count discrepancies
    flagged = [i for i in items.data if i.get("verification_status") in ("missing", "damaged")]

    return {
        "cycle": cycle.data,
        "auditors": [a.get("auditor", {}) for a in assignments.data],
        "items": items.data,
        "flagged_count": len(flagged),
        "total_items": len(items.data)
    }


@router.post("")
def create_audit_cycle(audit: AuditCycleCreate, authorization: str = Header(None)):
    """Create an audit cycle and populate it with assets from the specified department."""
    user = get_current_user(authorization)
    if user.get("role") not in ["admin", "asset_manager"]:
        raise HTTPException(status_code=403, detail="Only admins/asset managers can create audit cycles")

    sb = get_supabase()

    # Create the cycle
    cycle_data = {
        "name": audit.name,
        "department_id": audit.department_id,
        "location": audit.location,
        "start_date": audit.start_date,
        "end_date": audit.end_date,
        "status": "open",
        "notes": audit.notes,
        "created_by": user["id"]
    }

    cycle_result = sb.table("audit_cycles").insert(cycle_data).execute()
    cycle_id = cycle_result.data[0]["id"]

    # Assign auditors
    for auditor_id in audit.auditor_ids:
        sb.table("audit_assignments").insert({
            "audit_cycle_id": cycle_id,
            "auditor_id": auditor_id
        }).execute()

    # Populate audit items with assets from the department
    asset_query = sb.table("assets").select("id, tag, name, location")
    if audit.department_id:
        asset_query = asset_query.eq("department_id", audit.department_id)
    if audit.location:
        asset_query = asset_query.ilike("location", f"%{audit.location}%")

    assets = asset_query.execute()

    for asset in assets.data:
        sb.table("audit_items").insert({
            "audit_cycle_id": cycle_id,
            "asset_id": asset["id"],
            "expected_location": asset.get("location", ""),
            "verification_status": "pending"
        }).execute()

    # Log
    sb.table("activity_logs").insert({
        "user_id": user["id"],
        "user_name": user.get("full_name", ""),
        "action": f"Created audit cycle: {audit.name}",
        "entity_type": "audit",
        "entity_id": cycle_id,
        "details": {"asset_count": len(assets.data), "auditor_count": len(audit.auditor_ids)}
    }).execute()

    return {
        "cycle": cycle_result.data[0],
        "items_created": len(assets.data),
        "message": "Audit cycle created"
    }


@router.put("/{cycle_id}/items/{item_id}")
def update_audit_item(cycle_id: str, item_id: str, update: AuditItemUpdate, authorization: str = Header(None)):
    """Mark an audit item as verified/missing/damaged."""
    user = get_current_user(authorization)
    sb = get_supabase()

    # Verify the cycle is still open
    cycle = sb.table("audit_cycles").select("status").eq("id", cycle_id).single().execute()
    if not cycle.data or cycle.data["status"] != "open":
        raise HTTPException(status_code=400, detail="Audit cycle is closed")

    update_data = {
        "verification_status": update.verification_status,
        "verified_by": user["id"],
        "verified_at": datetime.utcnow().isoformat()
    }
    if update.notes:
        update_data["notes"] = update.notes

    result = sb.table("audit_items").update(update_data).eq("id", item_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Audit item not found")

    return {"item": result.data[0], "message": f"Item marked as {update.verification_status}"}


@router.post("/{cycle_id}/close")
def close_audit_cycle(cycle_id: str, authorization: str = Header(None)):
    """
    Close an audit cycle.
    - Locks it (no more edits)
    - Auto-updates asset statuses (missing → lost)
    - Generates discrepancy report
    """
    user = get_current_user(authorization)
    if user.get("role") not in ["admin", "asset_manager"]:
        raise HTTPException(status_code=403, detail="Only admins/asset managers can close audit cycles")

    sb = get_supabase()

    # Get all items
    items = sb.table("audit_items").select(
        "*, asset:assets(id, tag, name)"
    ).eq("audit_cycle_id", cycle_id).execute()

    # Update asset statuses for missing items
    missing_items = []
    damaged_items = []
    for item in items.data:
        if item["verification_status"] == "missing":
            sb.table("assets").update({"status": "lost"}).eq("id", item["asset_id"]).execute()
            missing_items.append(item)
        elif item["verification_status"] == "damaged":
            damaged_items.append(item)

    # Close the cycle
    sb.table("audit_cycles").update({
        "status": "closed",
        "closed_at": datetime.utcnow().isoformat()
    }).eq("id", cycle_id).execute()

    # Create notification about discrepancies
    if missing_items or damaged_items:
        admins = sb.table("profiles").select("id").in_("role", ["admin", "asset_manager"]).execute()
        for admin in admins.data:
            sb.table("notifications").insert({
                "user_id": admin["id"],
                "type": "audit",
                "title": f"Audit cycle closed — {len(missing_items) + len(damaged_items)} discrepancies",
                "message": f"{len(missing_items)} missing, {len(damaged_items)} damaged assets flagged.",
                "entity_type": "audit",
                "entity_id": cycle_id
            }).execute()

    # Log
    sb.table("activity_logs").insert({
        "user_id": user["id"],
        "user_name": user.get("full_name", ""),
        "action": f"Closed audit cycle",
        "entity_type": "audit",
        "entity_id": cycle_id,
        "details": {"missing": len(missing_items), "damaged": len(damaged_items)}
    }).execute()

    return {
        "message": "Audit cycle closed",
        "discrepancies": {
            "missing": len(missing_items),
            "damaged": len(damaged_items),
            "missing_items": [{"asset_tag": i.get("asset", {}).get("tag"), "asset_name": i.get("asset", {}).get("name")} for i in missing_items],
            "damaged_items": [{"asset_tag": i.get("asset", {}).get("tag"), "asset_name": i.get("asset", {}).get("name")} for i in damaged_items],
        }
    }


@router.get("/{cycle_id}/discrepancy-report")
def get_discrepancy_report(cycle_id: str, authorization: str = Header(None)):
    """Get auto-generated discrepancy report for an audit cycle."""
    user = get_current_user(authorization)
    sb = get_supabase()

    items = sb.table("audit_items").select(
        "*, asset:assets(id, tag, name, location)"
    ).eq("audit_cycle_id", cycle_id).in_("verification_status", ["missing", "damaged"]).execute()

    cycle = sb.table("audit_cycles").select("*, department:departments(id, name)").eq("id", cycle_id).single().execute()

    return {
        "cycle": cycle.data,
        "flagged_items": items.data,
        "total_flagged": len(items.data)
    }
