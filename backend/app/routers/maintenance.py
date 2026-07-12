from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.config import get_supabase
from app.routers.auth import get_current_user

router = APIRouter()


class MaintenanceCreate(BaseModel):
    asset_id: str
    issue_description: str
    priority: str = "medium"
    photo_url: Optional[str] = None


class TechnicianAssign(BaseModel):
    technician_name: Optional[str] = None
    technician_id: Optional[str] = None


@router.get("")
def list_maintenance(
    status: Optional[str] = None,
    asset_id: Optional[str] = None,
    authorization: str = Header(None)
):
    """List maintenance requests, grouped by status for kanban view."""
    user = get_current_user(authorization)
    sb = get_supabase()

    query = sb.table("maintenance_requests").select(
        "*, asset:assets(id, tag, name), raised_by_profile:profiles!maintenance_requests_raised_by_fkey(id, full_name)"
    )

    if status:
        query = query.eq("status", status)
    if asset_id:
        query = query.eq("asset_id", asset_id)

    result = query.order("created_at", desc=True).execute()

    # Group by status for kanban
    kanban = {
        "pending": [],
        "approved": [],
        "technician_assigned": [],
        "in_progress": [],
        "resolved": []
    }

    for req in result.data:
        s = req.get("status", "pending")
        if s in kanban:
            kanban[s].append(req)

    return {"requests": result.data, "kanban": kanban}


@router.post("")
def create_maintenance_request(req: MaintenanceCreate, authorization: str = Header(None)):
    """Raise a maintenance request."""
    user = get_current_user(authorization)
    sb = get_supabase()

    data = {
        "asset_id": req.asset_id,
        "raised_by": user["id"],
        "issue_description": req.issue_description,
        "priority": req.priority,
        "status": "pending",
        "photo_url": req.photo_url
    }

    result = sb.table("maintenance_requests").insert(data).execute()

    # Get asset info
    asset = sb.table("assets").select("tag, name").eq("id", req.asset_id).single().execute()
    asset_tag = asset.data.get("tag", "") if asset.data else ""

    # Notify asset managers
    managers = sb.table("profiles").select("id").in_("role", ["asset_manager", "admin"]).execute()
    for manager in managers.data:
        sb.table("notifications").insert({
            "user_id": manager["id"],
            "type": "maintenance",
            "title": f"Maintenance request: {asset_tag}",
            "message": f"{user.get('full_name', 'An employee')} raised a {req.priority} priority maintenance request for {asset_tag}: {req.issue_description[:100]}",
            "entity_type": "maintenance",
            "entity_id": result.data[0]["id"]
        }).execute()

    # Log
    sb.table("activity_logs").insert({
        "user_id": user["id"],
        "user_name": user.get("full_name", ""),
        "action": f"Raised maintenance request for {asset_tag}",
        "entity_type": "maintenance",
        "entity_id": result.data[0]["id"]
    }).execute()

    return {"request": result.data[0], "message": "Maintenance request submitted"}


@router.put("/{request_id}/approve")
def approve_maintenance(request_id: str, authorization: str = Header(None)):
    """Approve a maintenance request. Asset flips to Under Maintenance."""
    user = get_current_user(authorization)
    if user.get("role") not in ["admin", "asset_manager"]:
        raise HTTPException(status_code=403, detail="Only admins/asset managers can approve")

    sb = get_supabase()

    req = sb.table("maintenance_requests").select("*").eq("id", request_id).single().execute()
    if not req.data:
        raise HTTPException(status_code=404, detail="Request not found")

    # Update request status
    sb.table("maintenance_requests").update({
        "status": "approved",
        "approved_by": user["id"]
    }).eq("id", request_id).execute()

    # Flip asset to under_maintenance
    sb.table("assets").update({"status": "under_maintenance"}).eq("id", req.data["asset_id"]).execute()

    # Notify requester
    sb.table("notifications").insert({
        "user_id": req.data["raised_by"],
        "type": "approval",
        "title": f"Maintenance request approved",
        "message": f"Your maintenance request has been approved.",
        "entity_type": "maintenance",
        "entity_id": request_id
    }).execute()

    # Log
    asset = sb.table("assets").select("tag").eq("id", req.data["asset_id"]).single().execute()
    sb.table("activity_logs").insert({
        "user_id": user["id"],
        "user_name": user.get("full_name", ""),
        "action": f"Approved maintenance for {asset.data.get('tag', '')}",
        "entity_type": "maintenance",
        "entity_id": request_id
    }).execute()

    return {"message": "Maintenance request approved. Asset moved to Under Maintenance."}


@router.put("/{request_id}/reject")
def reject_maintenance(request_id: str, authorization: str = Header(None)):
    """Reject a maintenance request."""
    user = get_current_user(authorization)
    if user.get("role") not in ["admin", "asset_manager"]:
        raise HTTPException(status_code=403, detail="Only admins/asset managers can reject")

    sb = get_supabase()
    sb.table("maintenance_requests").update({"status": "rejected"}).eq("id", request_id).execute()
    return {"message": "Maintenance request rejected"}


@router.put("/{request_id}/assign-tech")
def assign_technician(request_id: str, tech: TechnicianAssign, authorization: str = Header(None)):
    """Assign a technician to the maintenance request."""
    user = get_current_user(authorization)
    if user.get("role") not in ["admin", "asset_manager"]:
        raise HTTPException(status_code=403, detail="Only admins/asset managers can assign technicians")

    sb = get_supabase()
    update_data = {"status": "technician_assigned"}
    if tech.technician_name:
        update_data["technician_name"] = tech.technician_name
    if tech.technician_id:
        update_data["technician_id"] = tech.technician_id

    sb.table("maintenance_requests").update(update_data).eq("id", request_id).execute()
    return {"message": "Technician assigned"}


@router.put("/{request_id}/start")
def start_maintenance(request_id: str, authorization: str = Header(None)):
    """Mark maintenance as in progress."""
    user = get_current_user(authorization)
    sb = get_supabase()

    sb.table("maintenance_requests").update({"status": "in_progress"}).eq("id", request_id).execute()
    return {"message": "Maintenance in progress"}


@router.put("/{request_id}/resolve")
def resolve_maintenance(request_id: str, authorization: str = Header(None)):
    """Resolve maintenance. Asset reverts to Available."""
    user = get_current_user(authorization)
    sb = get_supabase()

    req = sb.table("maintenance_requests").select("*").eq("id", request_id).single().execute()
    if not req.data:
        raise HTTPException(status_code=404, detail="Request not found")

    sb.table("maintenance_requests").update({
        "status": "resolved",
        "resolved_at": datetime.utcnow().isoformat()
    }).eq("id", request_id).execute()

    # Revert asset to available
    sb.table("assets").update({"status": "available"}).eq("id", req.data["asset_id"]).execute()

    # Log
    asset = sb.table("assets").select("tag").eq("id", req.data["asset_id"]).single().execute()
    sb.table("activity_logs").insert({
        "user_id": user["id"],
        "user_name": user.get("full_name", ""),
        "action": f"Resolved maintenance for {asset.data.get('tag', '')}",
        "entity_type": "maintenance",
        "entity_id": request_id
    }).execute()

    return {"message": "Maintenance resolved. Asset reverted to Available."}
