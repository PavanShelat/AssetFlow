from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel
from typing import Optional
from app.config import get_supabase
from app.routers.auth import get_current_user

router = APIRouter()


class AssetCreate(BaseModel):
    name: str
    category_id: Optional[str] = None
    serial_number: Optional[str] = None
    condition: str = "new"
    location: Optional[str] = None
    department_id: Optional[str] = None
    is_bookable: bool = False
    acquisition_date: Optional[str] = None
    acquisition_cost: Optional[float] = None
    warranty_expiry: Optional[str] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[str] = None
    serial_number: Optional[str] = None
    status: Optional[str] = None
    condition: Optional[str] = None
    location: Optional[str] = None
    department_id: Optional[str] = None
    is_bookable: Optional[bool] = None
    acquisition_date: Optional[str] = None
    acquisition_cost: Optional[float] = None
    warranty_expiry: Optional[str] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None


@router.get("")
def list_assets(
    search: Optional[str] = None,
    category_id: Optional[str] = None,
    status: Optional[str] = None,
    department_id: Optional[str] = None,
    location: Optional[str] = None,
    is_bookable: Optional[bool] = None,
    authorization: str = Header(None)
):
    """List assets with search and filters."""
    user = get_current_user(authorization)
    sb = get_supabase()

    query = sb.table("assets").select(
        "*, category:asset_categories(id, name), department:departments(id, name)"
    )

    if search:
        query = query.or_(f"tag.ilike.%{search}%,name.ilike.%{search}%,serial_number.ilike.%{search}%")
    if category_id:
        query = query.eq("category_id", category_id)
    if status:
        query = query.eq("status", status)
    if department_id:
        query = query.eq("department_id", department_id)
    if location:
        query = query.ilike("location", f"%{location}%")
    if is_bookable is not None:
        query = query.eq("is_bookable", is_bookable)

    result = query.order("created_at", desc=True).execute()
    return {"assets": result.data}


@router.get("/next-tag")
def get_next_tag(authorization: str = Header(None)):
    """Get the next available asset tag."""
    user = get_current_user(authorization)
    sb = get_supabase()

    result = sb.table("assets").select("tag").order("created_at", desc=True).limit(1).execute()
    if result.data:
        last_tag = result.data[0]["tag"]
        num = int(last_tag.split("-")[1]) + 1
    else:
        num = 1

    return {"next_tag": f"AF-{num:04d}"}


@router.get("/{asset_id}")
def get_asset(asset_id: str, authorization: str = Header(None)):
    """Get asset details with allocation and maintenance history."""
    user = get_current_user(authorization)
    sb = get_supabase()

    asset = sb.table("assets").select(
        "*, category:asset_categories(id, name), department:departments(id, name)"
    ).eq("id", asset_id).single().execute()

    if not asset.data:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Get allocation history
    allocations = sb.table("allocations").select(
        "*, allocated_to_profile:profiles!allocations_allocated_to_fkey(id, full_name), department:departments(id, name)"
    ).eq("asset_id", asset_id).order("created_at", desc=True).execute()

    # Get maintenance history
    maintenance = sb.table("maintenance_requests").select(
        "*, raised_by_profile:profiles!maintenance_requests_raised_by_fkey(id, full_name)"
    ).eq("asset_id", asset_id).order("created_at", desc=True).execute()

    return {
        "asset": asset.data,
        "allocation_history": allocations.data,
        "maintenance_history": maintenance.data
    }


@router.post("")
def create_asset(asset: AssetCreate, authorization: str = Header(None)):
    """Register a new asset. Tag is auto-generated."""
    user = get_current_user(authorization)
    if user.get("role") not in ["admin", "asset_manager"]:
        raise HTTPException(status_code=403, detail="Only admins and asset managers can register assets")

    sb = get_supabase()
    data = asset.model_dump(exclude_none=True)
    data["status"] = "available"

    try:
        result = sb.table("assets").insert(data).execute()

        # Log activity
        sb.table("activity_logs").insert({
            "user_id": user["id"],
            "user_name": user.get("full_name", ""),
            "action": f"Registered asset {result.data[0].get('tag', '')}",
            "entity_type": "asset",
            "entity_id": result.data[0]["id"],
            "details": {"name": asset.name}
        }).execute()

        return {"asset": result.data[0], "message": "Asset registered successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{asset_id}")
def update_asset(asset_id: str, asset: AssetUpdate, authorization: str = Header(None)):
    """Update asset details."""
    user = get_current_user(authorization)
    if user.get("role") not in ["admin", "asset_manager"]:
        raise HTTPException(status_code=403, detail="Only admins and asset managers can update assets")

    sb = get_supabase()
    data = asset.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = sb.table("assets").update(data).eq("id", asset_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"asset": result.data[0], "message": "Asset updated"}
