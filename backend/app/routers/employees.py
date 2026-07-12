from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from app.config import get_supabase
from app.routers.auth import get_current_user

router = APIRouter()


class EmployeeUpdate(BaseModel):
    department_id: Optional[str] = None
    status: Optional[str] = None
    phone: Optional[str] = None
    full_name: Optional[str] = None


class RoleUpdate(BaseModel):
    role: str  # employee, department_head, asset_manager, admin


@router.get("")
def list_employees(
    department_id: Optional[str] = None,
    role: Optional[str] = None,
    status: Optional[str] = None,
    authorization: str = Header(None)
):
    """List all employees with optional filters."""
    user = get_current_user(authorization)
    sb = get_supabase()

    query = sb.table("profiles").select("*, department:departments(id, name)")

    if department_id:
        query = query.eq("department_id", department_id)
    if role:
        query = query.eq("role", role)
    if status:
        query = query.eq("status", status)

    result = query.order("full_name").execute()
    return {"employees": result.data}


@router.get("/{employee_id}")
def get_employee(employee_id: str, authorization: str = Header(None)):
    """Get a single employee profile."""
    user = get_current_user(authorization)
    sb = get_supabase()

    result = sb.table("profiles").select("*, department:departments(id, name)").eq("id", employee_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"employee": result.data}


@router.put("/{employee_id}")
def update_employee(employee_id: str, emp: EmployeeUpdate, authorization: str = Header(None)):
    """Update employee details (Admin only)."""
    user = get_current_user(authorization)
    if user.get("role") not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admins can update employee details")

    sb = get_supabase()
    data = emp.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = sb.table("profiles").update(data).eq("id", employee_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"employee": result.data[0], "message": "Employee updated"}


@router.put("/{employee_id}/role")
def update_role(employee_id: str, role_update: RoleUpdate, authorization: str = Header(None)):
    """
    Promote/demote an employee's role.
    This is the ONLY place roles can be changed (Admin only).
    """
    user = get_current_user(authorization)
    if user.get("role") not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admins can change roles")

    valid_roles = ["employee", "department_head", "asset_manager", "admin"]
    if role_update.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {valid_roles}")

    sb = get_supabase()
    result = sb.table("profiles").update({"role": role_update.role}).eq("id", employee_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Log the role change
    sb.table("activity_logs").insert({
        "user_id": user["id"],
        "user_name": user.get("full_name", ""),
        "action": f"Changed role to {role_update.role}",
        "entity_type": "employee",
        "entity_id": employee_id,
        "details": {"new_role": role_update.role}
    }).execute()

    return {"employee": result.data[0], "message": f"Role updated to {role_update.role}"}
