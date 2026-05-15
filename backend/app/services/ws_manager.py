"""In-memory WebSocket connection manager per process."""
import uuid
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[uuid.UUID, set[WebSocket]] = {}

    async def connect(self, user_id: uuid.UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(websocket)

    def disconnect(self, user_id: uuid.UUID, websocket: WebSocket) -> None:
        conns = self._connections.get(user_id)
        if not conns:
            return
        conns.discard(websocket)
        if not conns:
            del self._connections[user_id]

    async def send_to_user(self, user_id: uuid.UUID, message: str) -> None:
        conns = self._connections.get(user_id, set()).copy()
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

    def has_connections(self, user_id: uuid.UUID) -> bool:
        return bool(self._connections.get(user_id))


ws_manager = ConnectionManager()
