"""Async TCP server accepting 4G DTU connections.

Each connection represents one drone link. Bytes are framed and parsed by a
per-connection MavlinkParser; parsed messages update the shared registry.

The connection is strictly READ-ONLY: no bytes are ever written back.
"""
import asyncio
import logging

from ..config import settings
from ..mavlink.parser import MavlinkParser
from ..mavlink.registry import registry

logger = logging.getLogger("lumidrone.dtu")


async def _handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    peer = writer.get_extra_info("peername")
    logger.info("DTU connected: %s", peer)
    parser = MavlinkParser()
    try:
        while True:
            data = await reader.read(4096)
            if not data:
                break
            for msg in parser.feed(data):
                registry.update(msg)
    except (ConnectionResetError, asyncio.IncompleteReadError):
        pass
    except Exception:
        logger.exception("DTU link error from %s", peer)
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        logger.info("DTU disconnected: %s", peer)


async def start_dtu_server() -> asyncio.base_events.Server:
    server = await asyncio.start_server(
        _handle_client, settings.DTU_HOST, settings.DTU_PORT
    )
    logger.info("DTU TCP server listening on %s:%s", settings.DTU_HOST, settings.DTU_PORT)
    return server
