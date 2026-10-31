"""HTTP routes for staff sign-in and account management. Who may call what is decided by
auth.AuthMiddleware (public / any signed-in staff / admin only), not here, so a mistake in this file
cannot open a route that the middleware keeps closed.

Handlers take only `request` and read path parameters from request.path_params, like the rest of the API.
"""
import functools

from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import JSONResponse

from . import auth

router = APIRouter(prefix="/api/v1")


def _handled(fn):
    @functools.wraps(fn)
    async def wrapper(request: Request):
        try:
            return await fn(request)
        except auth.AuthError as e:
            headers = {"Retry-After": str(e.extra["retryAfter"])} if "retryAfter" in e.extra else None
            return JSONResponse({"errors": e.errors, **e.extra}, status_code=e.status, headers=headers)
    return wrapper


async def _body(request):
    try:
        b = await request.json()
    except Exception:
        return {}
    return b if isinstance(b, dict) else {}


# ---------------------------------------------------------------- public: sign in / out

@router.get("/auth/setup-status")
@_handled
async def setup_status(request: Request):
    """Lets the sign-in page say 'no administrator yet' instead of leaving a new hub looking broken."""
    return {"adminExists": await run_in_threadpool(auth.has_admin)}


@router.post("/auth/login")
@_handled
async def login(request: Request):
    b = await _body(request)
    ip = request.client.host if request.client else None
    try:
        token, row = await run_in_threadpool(auth.login, b.get("username"), b.get("password"), ip)
    except auth.LoginError as e:
        if e.kind == "locked":
            raise auth.AuthError(429, f"Majaribio mengi mno. Subiri sekunde {e.retry_after} kisha ujaribu tena. / "
                                      f"Too many attempts. Wait {e.retry_after} seconds and try again.", retryAfter=e.retry_after)
        if e.kind == "inactive":
            raise auth.AuthError(403, "Akaunti hii imezimwa. Wasiliana na msimamizi wako. / "
                                      "This account has been deactivated. Contact your administrator.", deactivated=True)
        raise auth.AuthError(401, "Jina la mtumiaji au nenosiri si sahihi. / Wrong username or password.")
    previous = request.cookies.get(auth.COOKIE_NAME)
    if previous:  # someone else was signed in on this browser: end that session
        await run_in_threadpool(auth.end_session, previous)
    resp = JSONResponse({"user": auth.public_user(row)})
    auth.set_session_cookie(resp, token)
    return resp


@router.post("/auth/logout")
@_handled
async def logout(request: Request):
    """Idempotent: always succeeds and clears the cookie, even for an expired or missing session."""
    await run_in_threadpool(auth.end_session, request.cookies.get(auth.COOKIE_NAME))
    resp = JSONResponse({"ok": True})
    auth.clear_session_cookie(resp)
    return resp


# ---------------------------------------------------------------- any signed-in staff

@router.get("/auth/me")
@_handled
async def me(request: Request):
    return {"user": auth.public_user(request.state.staff)}


@router.post("/auth/password")
@_handled
async def change_password(request: Request):
    b = await _body(request)
    staff = request.state.staff
    row = await run_in_threadpool(auth.change_own_password, staff["staff_id"], b.get("currentPassword"),
                                  b.get("newPassword"), staff["session_hash"])
    return {"user": auth.public_user(row)}


# ---------------------------------------------------------------- administrators only (enforced by the middleware)

@router.get("/admin/staff")
@_handled
async def staff_list(request: Request):
    return {"staff": await run_in_threadpool(auth.list_staff)}


@router.post("/admin/staff")
@_handled
async def staff_create(request: Request):
    """Body: {username, fullName, password?}. Always creates a CHW. A blank password generates a one-time one."""
    b = await _body(request)
    user, temp = await run_in_threadpool(auth.admin_create_chw, request.state.staff["staff_id"],
                                         b.get("username"), b.get("fullName"), b.get("password") or None)
    return JSONResponse({"user": user, "temporaryPassword": temp}, status_code=201)


@router.put("/admin/staff/{staff_id}")
@_handled
async def staff_update(request: Request):
    b = await _body(request)
    return {"user": await run_in_threadpool(auth.admin_rename, request.path_params["staff_id"], b.get("fullName"))}


@router.post("/admin/staff/{staff_id}/deactivate")
@_handled
async def staff_deactivate(request: Request):
    return {"user": await run_in_threadpool(auth.admin_set_active, request.path_params["staff_id"], False)}


@router.post("/admin/staff/{staff_id}/activate")
@_handled
async def staff_activate(request: Request):
    return {"user": await run_in_threadpool(auth.admin_set_active, request.path_params["staff_id"], True)}


@router.post("/admin/staff/{staff_id}/reset-password")
@_handled
async def staff_reset_password(request: Request):
    user, temp = await run_in_threadpool(auth.admin_reset_password, request.path_params["staff_id"])
    return {"user": user, "temporaryPassword": temp}


@router.post("/admin/staff/{staff_id}/unlock")
@_handled
async def staff_unlock(request: Request):
    return {"user": await run_in_threadpool(auth.admin_unlock, request.path_params["staff_id"])}
