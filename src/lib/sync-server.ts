// Each invocation holds the same OS lock through the read and atomic replacement.
// SSH only transports requests; no listening server or background service is needed.
export const SYNC_SERVER = String.raw`
import fcntl, json, os, shutil, sys, tempfile
from pathlib import Path

root = Path.home() / "Library/Application Support/Link Groups Sync"
root.mkdir(parents=True, exist_ok=True, mode=0o700)
database = root / "database.json"
request = json.load(sys.stdin)

def validate(db):
    if not isinstance(db, dict) or db.get("version") != 1 or not isinstance(db.get("groups"), list):
        raise ValueError("Invalid group database")
    group_ids = set()
    for group in db["groups"]:
        if not isinstance(group, dict) or not isinstance(group.get("links"), list):
            raise ValueError("Invalid group")
        for field in ("id", "title"):
            if not isinstance(group.get(field), str) or not group[field].strip():
                raise ValueError("Invalid group field")
        if group["id"] in group_ids:
            raise ValueError("Duplicate group ID")
        group_ids.add(group["id"])
        link_ids = set()
        for link in group["links"]:
            if not isinstance(link, dict):
                raise ValueError("Invalid link")
            for field in ("id", "title", "url"):
                if not isinstance(link.get(field), str) or not link[field].strip():
                    raise ValueError("Invalid link field")
            if link["id"] in link_ids:
                raise ValueError("Duplicate link ID")
            link_ids.add(link["id"])

def save(state):
    if database.exists():
        previous = json.loads(database.read_text())
        backups = root / "backups"
        backups.mkdir(exist_ok=True, mode=0o700)
        snapshot = backups / ("revision-%s.json" % previous["revision"])
        if not snapshot.exists():
            with snapshot.open("x") as output:
                os.chmod(snapshot, 0o600)
                json.dump(previous["db"], output)
                output.flush()
                os.fsync(output.fileno())
        shutil.copyfile(database, root / "database-backup.json")
        os.chmod(root / "database-backup.json", 0o600)
    with tempfile.NamedTemporaryFile(mode="w", dir=root, delete=False) as output:
        temporary = output.name
        json.dump(state, output)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, database)

with (root / "database.lock").open("a") as lock:
    os.chmod(root / "database.lock", 0o600)
    fcntl.flock(lock, fcntl.LOCK_EX)
    state = json.loads(database.read_text()) if database.exists() else None
    if state is not None:
        if state.get("version") != 1 or not isinstance(state.get("revision"), int):
            raise ValueError("Invalid sync database")
        validate(state["db"])
    action = request["action"]
    if action == "join":
        incoming = request["db"]
        validate(incoming)
        if state is None:
            state = {"version": 1, "revision": 0, "db": incoming}
            save(state)
        else:
            before = json.dumps(state["db"], sort_keys=True)
            groups = {group["id"]: group for group in state["db"]["groups"]}
            for group in incoming["groups"]:
                existing = groups.get(group["id"])
                if existing is None:
                    state["db"]["groups"].append(group)
                    groups[group["id"]] = group
                else:
                    links = {link["id"] for link in existing["links"]}
                    existing["links"].extend(link for link in group["links"] if link["id"] not in links)
            if json.dumps(state["db"], sort_keys=True) != before:
                state["revision"] += 1
                save(state)
    elif action == "write":
        if state is None:
            raise ValueError("Sync database has not been initialized")
        validate(request["db"])
        if request["revision"] != state["revision"]:
            print(json.dumps({"conflict": True}))
            sys.exit(0)
        if request["db"] != state["db"]:
            state["db"] = request["db"]
            state["revision"] += 1
            save(state)
    elif action != "read":
        raise ValueError("Unknown sync action")
    if state is None:
        raise ValueError("Sync database has not been initialized")
    print(json.dumps(state))
`;
