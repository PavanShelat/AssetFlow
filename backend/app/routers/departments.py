from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional, List
from app.config import get_supabase
from app.routers.auth import get_current_user

router = APIRouter()


class DepartmentCreate(BaseModel):
    name: str
    head_id: Optional[str] = None
    parent_id: Optional[str] = None
    status: str = "active"
    description: Optional[str] = None


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    head_id: Optional[str] = None
    parent_id: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None


@router.get("")
def list_departments(authorization: str = Header(None)):
    """List all departments with head name and parent department name."""
    user = get_current_user(authorization)
    sb = get_supabase()

    departments = sb.table("departments").select(
        "*, head:profiles!departments_head_id_fkey(id, full_name), parent:departments!departments_parent_id_fkey(id, name)"
    ).order("name").execute()

    return {"departments": departments.data}


@router.post("")
def create_department(dept: DepartmentCreate, authorization: str = Header(None)):
    """Create a new department (Admin only)."""
    user = get_current_user(authorization)
    if user.get("role") not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admins can create departments")

    sb = get_supabase()
    try:
        data = dept.model_dump(exclude_none=True)
        result = sb.table("departments").insert(data).execute()
        return {"department": result.data[0], "message": "Department created successfully"}
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="Department name already exists")
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{dept_id}")
def update_department(dept_id: str, dept: DepartmentUpdate, authorization: str = Header(None)):
    """Update a department (Admin only)."""
    user = get_current_user(authorization)
    if user.get("role") not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admins can update departments")

    sb = get_supabase()
    data = dept.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = sb.table("departments").update(data).eq("id", dept_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Department not found")
    return {"department": result.data[0], "message": "Department updated"}


@router.delete("/{dept_id}")
def deactivate_department(dept_id: str, authorization: str = Header(None)):
    """Deactivate a department (sets status to inactive)."""
    user = get_current_user(authorization)
    if user.get("role") not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admins can deactivate departments")

    sb = get_supabase()
    result = sb.table("departments").update({"status": "inactive"}).eq("id", dept_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Department not found")
    return {"message": "Department deactivated"}
