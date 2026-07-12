from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.config import get_supabase, get_supabase_anon

router = APIRouter()


class SignupRequest(BaseModel):
    email: str
    password: str
    full_name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    user: dict
    session: Optional[dict] = None
    message: str


def get_current_user(authorization: str = Header(None)):
    """Extract and verify user from Authorization header."""
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization header")

    token = authorization.replace("Bearer ", "")
    sb = get_supabase()

    try:
        user_response = sb.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")

        # Get profile with role
        profile = sb.table("profiles").select("*").eq("id", user_response.user.id).single().execute()
        return profile.data
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")


@router.post("/signup")
def signup(request: SignupRequest):
    """Sign up a new user. Always creates an Employee account."""
    sb = get_supabase()
    try:
        auth_response = sb.auth.sign_up({
            "email": request.email,
            "password": request.password,
            "options": {
                "data": {
                    "full_name": request.full_name
                }
            }
        })

        if auth_response.user:
            return {
                "message": "Account created successfully. You have been assigned the Employee role.",
                "user": {
                    "id": str(auth_response.user.id),
                    "email": auth_response.user.email,
                    "full_name": request.full_name,
                    "role": "employee"
                },
                "session": {
                    "access_token": auth_response.session.access_token if auth_response.session else None,
                    "refresh_token": auth_response.session.refresh_token if auth_response.session else None,
                } if auth_response.session else None
            }
        else:
            raise HTTPException(status_code=400, detail="Signup failed")
    except Exception as e:
        if "already registered" in str(e).lower():
            raise HTTPException(status_code=409, detail="Email already registered")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
def login(request: LoginRequest):
    """Log in with email and password."""
    sb = get_supabase()
    try:
        auth_response = sb.auth.sign_in_with_password({
            "email": request.email,
            "password": request.password
        })

        if auth_response.user and auth_response.session:
            # Fetch user profile with role
            profile = sb.table("profiles").select("*").eq("id", str(auth_response.user.id)).single().execute()

            return {
                "message": "Login successful",
                "user": profile.data,
                "session": {
                    "access_token": auth_response.session.access_token,
                    "refresh_token": auth_response.session.refresh_token,
                }
            }
        else:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Login failed: {str(e)}")


@router.get("/me")
def get_me(authorization: str = Header(None)):
    """Get current authenticated user profile."""
    user = get_current_user(authorization)
    return {"user": user}


@router.post("/logout")
def logout():
    """Log out (client-side token removal is sufficient for demo)."""
    return {"message": "Logged out successfully"}
