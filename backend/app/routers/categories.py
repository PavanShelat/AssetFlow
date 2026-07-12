from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, List
from app.config import get_supabase
from app.routers.auth import get_current_user

router = APIRouter()


class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    custom_fields: Optional[list] = []


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    custom_fields: Optional[list] = None


@router.get("")
def list_categories(authorization: str = Header(None)):
    """List all asset categories."""
    user = get_current_user(authorization)
    sb = get_supabase()

    result = sb.table("asset_categories").select("*").order("name").execute()
    return {"categories": result.data}


@router.post("")
def create_category(category: CategoryCreate, authorization: str = Header(None)):
    """Create a new asset category (Admin only)."""
    user = get_current_user(authorization)
    if user.get("role") not in ["admin", "asset_manager"]:
        raise HTTPException(status_code=403, detail="Only admins and asset managers can create categories")

    sb = get_supabase()
    try:
        data = category.model_dump(exclude_none=True)
        result = sb.table("asset_categories").insert(data).execute()
        return {"category": result.data[0], "message": "Category created successfully"}
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="Category name already exists")
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{category_id}")
def update_category(category_id: str, category: CategoryUpdate, authorization: str = Header(None)):
    """Update an asset category."""
    user = get_current_user(authorization)
    if user.get("role") not in ["admin", "asset_manager"]:
        raise HTTPException(status_code=403, detail="Only admins and asset managers can update categories")

    sb = get_supabase()
    data = category.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = sb.table("asset_categories").update(data).eq("id", category_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"category": result.data[0], "message": "Category updated"}
