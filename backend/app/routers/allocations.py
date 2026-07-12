from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from app.config import get_supabase
from app.routers.auth import get_current_user

router = APIRouter()


class AllocateRequest(BaseModel):
    asset_id: str
    allocated_to: str  # employee ID
    department_id: Optional[str] = None
    expected_return_date: Optional[str] = None


class ReturnRequest(BaseModel):
    allocation_id: str
    condition_notes: Optional[str] = None


class TransferRequest(BaseModel):
    asset_id: str
    from_employee_id: str
    to_employee_id: str
    reason: Optional[str] = None


@router.get("")
def list_allocations(
    status: Optional[str] = None,
    asset_id: Optional[str] = None,
    authorization: str = Header(None)
):
    """List allocations with optional filters."""
    user = get_current_user(authorization)
    sb = get_supabase()

    query = sb.table("allocations").select(
        "*, asset:assets(id, tag, name), allocated_to_profile:profiles!allocations_allocated_to_fkey(id, full_name, email), department:departments(id, name), allocated_by_profile:profiles!allocations_allocated_by_fkey(id, full_name)"
    )

    if status:
        query = query.eq("status", status)
    if asset_id:
        query = query.eq("asset_id", asset_id)

    result = query.order("created_at", desc=True).execute()
    return {"allocations": result.data}


@router.get("/history/{asset_id}")
def get_allocation_history(asset_id: str, authorization: str = Header(None)):
    """Get full allocation history for an asset."""
    user = get_current_user(authorization)
    sb = get_supabase()

    result = sb.table("allocations").select(
        "*, allocated_to_profile:profiles!allocations_allocated_to_fkey(id, full_name), department:departments(id, name)"
    ).eq("asset_id", asset_id).order("created_at", desc=True).execute()

    return {"history": result.data}


@router.post("")
def allocate_asset(req: AllocateRequest, authorization: str = Header(None)):
    """
    ⭐ SIGNATURE FEATURE: Allocate an asset to an employee.
    If the asset is already allocated, BLOCK the allocation and return
    the current holder's info with a prompt to submit a Transfer Request instead.
    """
    user = get_current_user(authorization)
    if user.get("role") not in ["admin", "asset_manager", "department_head"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    sb = get_supabase()

    # Check for existing active allocation
    existing = sb.table("allocations").select(
        "*, allocated_to_profile:profiles!allocations_allocated_to_fkey(id, full_name), department:departments(id, name)"
    ).eq("asset_id", req.asset_id).eq("status", "active").execute()

    if existing.data:
        holder = existing.data[0]
        holder_name = holder.get("allocated_to_profile", {}).get("full_name", "Unknown")
        dept_name = holder.get("department", {}).get("name", "Unknown") if holder.get("department") else "No Department"

        raise HTTPException(
            status_code=409,
            detail={
                "message": f"Already Allocated to {holder_name} ({dept_name}). Direct re-allocation is blocked — submit a transfer request below.",
                "current_holder": {
                    "employee_id": holder["allocated_to"],
                    "employee_name": holder_name,
                    "department": dept_name,
                    "allocation_id": holder["id"],
                    "allocated_since": holder["created_at"]
                }
            }
        )

    # No conflict — proceed with allocation
    allocation_data = {
        "asset_id": req.asset_id,
        "allocated_to": req.allocated_to,
        "department_id": req.department_id,
        "allocated_by": user["id"],
        "expected_return_date": req.expected_return_date,
        "status": "active"
    }

    result = sb.table("allocations").insert(allocation_data).execute()

    # Update asset status to allocated
    sb.table("assets").update({"status": "allocated"}).eq("id", req.asset_id).execute()

    # Get asset info for notification
    asset = sb.table("assets").select("tag, name").eq("id", req.asset_id).single().execute()
    asset_tag = asset.data.get("tag", "") if asset.data else ""
    asset_name = asset.data.get("name", "") if asset.data else ""

    # Create notification for the allocated employee
    sb.table("notifications").insert({
        "user_id": req.allocated_to,
        "type": "allocation",
        "title": f"{asset_name} {asset_tag} assigned to you",
        "message": f"Asset {asset_tag} has been allocated to you by {user.get('full_name', 'Asset Manager')}.",
        "entity_type": "allocation",
        "entity_id": result.data[0]["id"]
    }).execute()

    # Log activity
    sb.table("activity_logs").insert({
        "user_id": user["id"],
        "user_name": user.get("full_name", ""),
        "action": f"Allocated {asset_tag} to employee",
        "entity_type": "allocation",
        "entity_id": result.data[0]["id"],
        "details": {"asset_id": req.asset_id, "allocated_to": req.allocated_to}
    }).execute()

    return {"allocation": result.data[0], "message": "Asset allocated successfully"}


@router.post("/return")
def return_asset(req: ReturnRequest, authorization: str = Header(None)):
    """Mark an allocation as returned. Asset reverts to Available."""
    user = get_current_user(authorization)
    sb = get_supabase()

    # Get the allocation
    allocation = sb.table("allocations").select("*").eq("id", req.allocation_id).single().execute()
    if not allocation.data:
        raise HTTPException(status_code=404, detail="Allocation not found")

    # Update allocation
    from datetime import datetime
    sb.table("allocations").update({
        "status": "returned",
        "actual_return_date": datetime.utcnow().isoformat(),
        "condition_notes": req.condition_notes
    }).eq("id", req.allocation_id).execute()

    # Revert asset to available
    sb.table("assets").update({"status": "available"}).eq("id", allocation.data["asset_id"]).execute()

    # Log activity
    asset = sb.table("assets").select("tag").eq("id", allocation.data["asset_id"]).single().execute()
    sb.table("activity_logs").insert({
        "user_id": user["id"],
        "user_name": user.get("full_name", ""),
        "action": f"Returned asset {asset.data.get('tag', '')}",
        "entity_type": "allocation",
        "entity_id": req.allocation_id,
        "details": {"condition_notes": req.condition_notes}
    }).execute()

    return {"message": "Asset returned successfully"}


# ==================== TRANSFER REQUESTS ====================

@router.get("/transfers")
def list_transfers(
    status: Optional[str] = None,
    authorization: str = Header(None)
):
    """List transfer requests."""
    user = get_current_user(authorization)
    sb = get_supabase()

    query = sb.table("transfer_requests").select(
        "*, asset:assets(id, tag, name), from_employee:profiles!transfer_requests_from_employee_id_fkey(id, full_name), to_employee:profiles!transfer_requests_to_employee_id_fkey(id, full_name), approver:profiles!transfer_requests_approved_by_fkey(id, full_name)"
    )

    if status:
        query = query.eq("status", status)

    result = query.order("created_at", desc=True).execute()
    return {"transfers": result.data}


@router.post("/transfers")
def create_transfer_request(req: TransferRequest, authorization: str = Header(None)):
    """Submit a transfer request."""
    user = get_current_user(authorization)
    sb = get_supabase()

    data = {
        "asset_id": req.asset_id,
        "from_employee_id": req.from_employee_id,
        "to_employee_id": req.to_employee_id,
        "reason": req.reason,
        "status": "requested"
    }

    result = sb.table("transfer_requests").insert(data).execute()

    # Notify asset managers
    managers = sb.table("profiles").select("id").in_("role", ["asset_manager", "admin"]).execute()
    asset = sb.table("assets").select("tag, name").eq("id", req.asset_id).single().execute()
    asset_tag = asset.data.get("tag", "") if asset.data else ""

    for manager in managers.data:
        sb.table("notifications").insert({
            "user_id": manager["id"],
            "type": "transfer",
            "title": f"Transfer request for {asset_tag}",
            "message": f"Transfer request submitted for {asset_tag}.",
            "entity_type": "transfer",
            "entity_id": result.data[0]["id"]
        }).execute()

    return {"transfer": result.data[0], "message": "Transfer request submitted"}


@router.put("/transfers/{transfer_id}/approve")
def approve_transfer(transfer_id: str, authorization: str = Header(None)):
    """Approve a transfer request — re-allocates the asset."""
    user = get_current_user(authorization)
    if user.get("role") not in ["admin", "asset_manager", "department_head"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    sb = get_supabase()
    from datetime import datetime

    transfer = sb.table("transfer_requests").select("*").eq("id", transfer_id).single().execute()
    if not transfer.data:
        raise HTTPException(status_code=404, detail="Transfer request not found")

    if transfer.data["status"] != "requested":
        raise HTTPException(status_code=400, detail="Transfer is not in requested status")

    # Return current allocation
    current_alloc = sb.table("allocations").select("id").eq(
        "asset_id", transfer.data["asset_id"]
    ).eq("status", "active").execute()

    if current_alloc.data:
        sb.table("allocations").update({
            "status": "returned",
            "actual_return_date": datetime.utcnow().isoformat(),
            "condition_notes": "Transferred"
        }).eq("id", current_alloc.data[0]["id"]).execute()

    # Create new allocation
    sb.table("allocations").insert({
        "asset_id": transfer.data["asset_id"],
        "allocated_to": transfer.data["to_employee_id"],
        "allocated_by": user["id"],
        "status": "active"
    }).execute()

    # Update transfer status
    sb.table("transfer_requests").update({
        "status": "approved",
        "approved_by": user["id"],
        "approved_at": datetime.utcnow().isoformat()
    }).eq("id", transfer_id).execute()

    # Notification
    asset = sb.table("assets").select("tag").eq("id", transfer.data["asset_id"]).single().execute()
    sb.table("notifications").insert({
        "user_id": transfer.data["to_employee_id"],
        "type": "transfer",
        "title": f"Transfer approved: {asset.data.get('tag', '')}",
        "message": f"Asset {asset.data.get('tag', '')} has been transferred to you.",
        "entity_type": "transfer",
        "entity_id": transfer_id
    }).execute()

    # Log
    sb.table("activity_logs").insert({
        "user_id": user["id"],
        "user_name": user.get("full_name", ""),
        "action": f"Approved transfer of {asset.data.get('tag', '')}",
        "entity_type": "transfer",
        "entity_id": transfer_id
    }).execute()

    return {"message": "Transfer approved and asset re-allocated"}


@router.put("/transfers/{transfer_id}/reject")
def reject_transfer(transfer_id: str, authorization: str = Header(None)):
    """Reject a transfer request."""
    user = get_current_user(authorization)
    if user.get("role") not in ["admin", "asset_manager", "department_head"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    sb = get_supabase()
    from datetime import datetime

    sb.table("transfer_requests").update({
        "status": "rejected",
        "approved_by": user["id"],
        "approved_at": datetime.utcnow().isoformat()
    }).eq("id", transfer_id).execute()

    return {"message": "Transfer request rejected"}
