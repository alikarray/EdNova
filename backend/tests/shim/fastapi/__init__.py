"""LOCAL TEST STAND-IN for FastAPI (the real package is not installable in the build sandbox).

Only the small part of FastAPI that main.py uses. It is added to sys.path by tests/e2e_server.py
ONLY. On your machine the real FastAPI from requirements.txt is always used.
"""
import inspect
import json
import typing

from pydantic import BaseModel, ValidationError
from starlette.applications import Starlette
from starlette.datastructures import UploadFile
from starlette.responses import JSONResponse, Response
from starlette.routing import Mount, Route


class HTTPException(Exception):
    def __init__(self, status_code, detail=None):
        super().__init__(detail)
        self.status_code, self.detail = status_code, detail


class _Marker:
    def __init__(self, kind):
        self.kind = kind


def File(*a, **k):
    return _Marker("file")


def Form(default=..., *a, **k):
    m = _Marker("form")
    m.default = default
    return m


async def _bind(fn, request):
    sig, hints, kwargs, form = inspect.signature(fn), typing.get_type_hints(fn), {}, None
    for name, param in sig.parameters.items():
        ann, default = hints.get(name, str), param.default
        if isinstance(default, _Marker):
            if form is None:
                form = await request.form()
            kwargs[name] = form.get(name)
            if kwargs[name] is None:
                dflt = getattr(default, "default", ...)
                if dflt is ...:
                    raise HTTPException(422, f"missing form field {name}")
                kwargs[name] = dflt
        elif name in request.path_params:
            kwargs[name] = ann(request.path_params[name]) if ann in (int, str) else request.path_params[name]
        elif inspect.isclass(ann) and issubclass(ann, BaseModel):
            kwargs[name] = ann.model_validate(await request.json())
        elif name in request.query_params:
            raw = request.query_params[name]
            kwargs[name] = int(raw) if ann is int else raw
        elif default is not inspect.Parameter.empty:
            kwargs[name] = default
        else:
            raise HTTPException(422, f"missing query parameter {name}")
    return kwargs


class FastAPI(Starlette):
    def __init__(self, title=""):
        super().__init__()
        self.title = title

    def _route(self, method, path):
        def deco(fn):
            async def endpoint(request):
                try:
                    result = await fn(**await _bind(fn, request))
                except HTTPException as e:
                    return JSONResponse({"detail": e.detail}, status_code=e.status_code)
                except ValidationError as e:
                    return JSONResponse({"detail": json.loads(e.json())}, status_code=422)
                return result if isinstance(result, Response) else JSONResponse(result)
            self.router.routes.append(Route(path, endpoint, methods=[method]))
            return fn
        return deco

    def get(self, path):
        return self._route("GET", path)

    def post(self, path):
        return self._route("POST", path)

    def delete(self, path):
        return self._route("DELETE", path)

    def mount(self, path, app, name=None):
        self.router.routes.append(Mount(path, app=app, name=name))


__all__ = ["FastAPI", "HTTPException", "File", "Form", "UploadFile"]
