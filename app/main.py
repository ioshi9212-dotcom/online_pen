from __future__ import annotations

import json
import os
import re
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from app.core.storage import (
    append_jsonl,
    debug_info,
    ensure_runtime_root,
    ensure_session,
    read_json,
    read_project_or_runtime_file,
    read_state,
    safe_repo_path,
    session_root,
    session_state_root,
    utc_now,
    write_json_atomic,
    write_state,
)

PROJECT_SLUG = os.getenv("PROJECT_SLUG", "academy-1198-v3")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").rstrip("/")
COMPACT_EVERY_TURNS = int(os.getenv("COMPACT_EVERY_TURNS", "15"))
MAX_FILE_CHARS = int(os.getenv("MAX_FILE_CHARS", "18000"))
MAX_SCENE_SLICE_CHARS = int(os.getenv("MAX_SCENE_SLICE_CHARS", "6000"))

app = FastAPI(title=f"{PROJECT_SLUG} GPT Actions API", version="3.1.0")


class CreateSessionRequest(BaseModel):
    session_id: str | None = None
    reset: bool = True


class TurnContractRequest(BaseModel):
    user_input: str
    mode: Literal["play", "technical", "audit", "transfer"] = "play"
    include_file_contents: bool = True


class ApplyTurnResultRequest(BaseModel):
    scene_id: str = "scene"
    scene_text: str = ""
    technical: bool = False
    current_state_changes: dict[str, Any] = Field(default_factory=dict)
    knowledge_changes: dict[str, Any] = Field(default_factory=dict)
    relationship_changes: dict[str, Any] = Field(default_factory=dict)
    open_thread_changes: dict[str, Any] = Field(default_factory=dict)
    shared_incident_changes: dict[str, Any] = Field(default_factory=dict)
    inventory_changes: dict[str, Any] = Field(default_factory=dict)
    character_memory_changes: dict[str, Any] = Field(default_factory=dict)


class ApplyTurnResultSimpleRequest(BaseModel):
    scene_id: str = "scene"
    scene_text: str = ""
    technical: bool = False
    current_state_changes_json: str = "{}"
    knowledge_changes_json: str = "{}"
    relationship_changes_json: str = "{}"
    open_thread_changes_json: str = "{}"
    shared_incident_changes_json: str = "{}"
    inventory_changes_json: str = "{}"
    character_memory_changes_json: str = "{}"


class CompactRequest(BaseModel):
    reason: str = "scheduled_compaction"
    compact_last_turns: int = 15
    recent_turns_md: str | None = None
    state_updates: dict[str, Any] = Field(default_factory=dict)


CORE_REQUIRED_FILES = [
    "engine/output_format.md",
    "engine/scene_generation_rules.md",
    "engine/pov_rules.md",
    "engine/memory_update_rules.md",
    "story/pacing/no_filler_rules.md",
    "state/current_state.json",
    "state/recent_turns.md",
    "characters/characters_index.yaml",
    "world/locations/locations_index.yaml",
    "knowledge/knowledge_rules.md",
]

TECHNICAL_EXTRA_FILES = [
    "MANCHESS_RULES.md",
    "engine/turn_contract.md",
    "engine/loading_policy.md",
    "engine/source_priority.md",
    "engine/session_policy.md",
    "engine/npc_knowledge_rules.md",
    "engine/anti_hallucination_rules.md",
    "validation/checklist_before_scene.md",
    "validation/calendar_skip_check.md",
    "validation/npc_knowledge_check.md",
    "validation/pov_violation_check.md",
    "relationships/relationships_index.yaml",
    "relationships/pair_schema.yaml",
]

AUDIT_EXTRA_FILES = [
    "validation/checklist_after_scene.md",
    "relationships/shared_incidents/incidents_index.yaml",
    "relationships/shared_incidents/incident_template.yaml",
]


def character_core_files(folder: str) -> list[str]:
    return [
        f"characters/{folder}/character_card.yaml",
        f"characters/{folder}/appearance.md",
        f"characters/{folder}/behavior.md",
        f"characters/{folder}/voice.md",
        f"characters/{folder}/knowledge.yaml",
        f"characters/{folder}/links.yaml",
    ]


def character_light_files(folder: str) -> list[str]:
    return [f"characters/{folder}/character_card.yaml"]


def character_goal_files(folder: str) -> list[str]:
    return [f"characters/{folder}/goals.yaml"]


def character_detail_files(folder: str) -> list[str]:
    return [
        f"characters/{folder}/energy.yaml",
        f"characters/{folder}/habits.md",
        f"characters/{folder}/past.md",
    ]


CHARACTER_FOLDERS: dict[str, str] = {
    "char_akira": "akira",
    "char_livia": "livia",
    "char_kir": "kir",
    "char_kiara": "kiara",
    "char_haru": "haru",
    "char_raiden": "raiden",
    "char_samuel": "samuel",
}

LOCATION_REQUIRED_FILES: dict[str, list[str]] = {
    "loc_academy_main": [
        "world/locations/academy_main/location_card.yaml",
        "world/locations/academy_main/visual_description.md",
    ],
}


def unique(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        if isinstance(value, str) and value and value not in result:
            result.append(value)
    return result


def as_id_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return unique([item for item in value if isinstance(item, str)])


def trim_text(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n...[truncated]"


def trim(text: str) -> dict[str, Any]:
    if len(text) <= MAX_FILE_CHARS:
        return {"content": text, "truncated": False, "chars": len(text)}
    return {"content": text[:MAX_FILE_CHARS], "truncated": True, "chars": len(text)}


def safe_read_text(path: str, session_id: str | None = None, max_chars: int = MAX_SCENE_SLICE_CHARS) -> str:
    try:
        return trim_text(read_project_or_runtime_file(path, session_id), max_chars)
    except Exception:
        return ""


def deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            base[key] = deep_merge(base[key], value)
        else:
            base[key] = value
    return base


def parse_json_text(value: str) -> dict[str, Any]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def read_json_state(session_id: str, filename: str) -> dict[str, Any]:
    value = read_state(session_id, filename)
    return value if isinstance(value, dict) else {}


def write_json_state(session_id: str, filename: str, patch: dict[str, Any]) -> None:
    current = read_json_state(session_id, filename)
    deep_merge(current, patch)
    current["updated_at"] = utc_now()
    write_state(session_id, filename, current)


def character_folder(character_id: str) -> str | None:
    return CHARACTER_FOLDERS.get(character_id)


def add_character_files(required_files: list[str], character_ids: list[str], *, level: Literal["light", "full", "goals", "details"] = "full") -> None:
    for character_id in character_ids:
        folder = character_folder(character_id)
        if not folder:
            continue
        if level == "light":
            required_files.extend(character_light_files(folder))
        elif level == "goals":
            required_files.extend(character_goal_files(folder))
        elif level == "details":
            required_files.extend(character_detail_files(folder))
        else:
            required_files.extend(character_core_files(folder))


def add_location_files(required_files: list[str], location_id: str | None) -> None:
    if location_id:
        required_files.extend(LOCATION_REQUIRED_FILES.get(location_id, []))


def should_load_goals(current_state: dict[str, Any], character_id: str) -> bool:
    ids = unique(
        as_id_list(current_state.get("goal_character_ids"))
        + as_id_list(current_state.get("initiator_character_ids"))
        + as_id_list(current_state.get("scene_driver_character_ids"))
    )
    return character_id in ids


def should_load_details(current_state: dict[str, Any], character_id: str) -> bool:
    for key in (
        "detail_character_ids",
        "energy_character_ids",
        "habit_character_ids",
        "past_character_ids",
        "training_character_ids",
        "combat_character_ids",
        "close_interaction_character_ids",
    ):
        if character_id in as_id_list(current_state.get(key)):
            return True
    scene_tags = set(as_id_list(current_state.get("scene_tags")))
    return bool(scene_tags & {"energy", "training", "combat", "sparring", "past", "memory", "medical", "injury"})


def selected_character_ids(current_state: dict[str, Any]) -> dict[str, list[str]]:
    pov_id = current_state.get("pov_character_id")
    active = as_id_list(current_state.get("active_character_ids"))
    nearby = as_id_list(current_state.get("nearby_character_ids"))
    mentioned = as_id_list(current_state.get("mentioned_character_ids"))
    scheduled = as_id_list(current_state.get("scheduled_character_ids"))
    delayed = as_id_list(current_state.get("delayed_character_ids"))
    full = unique(([pov_id] if isinstance(pov_id, str) else []) + active + nearby)
    reference = [cid for cid in unique(mentioned + scheduled + delayed) if cid not in full]
    return {"full": full, "reference": reference, "active": active, "nearby": nearby, "mentioned": mentioned, "scheduled": scheduled, "delayed": delayed}


def build_required_files(current_state: dict[str, Any], mode: str) -> list[str]:
    required_files = list(CORE_REQUIRED_FILES)
    arc_id = current_state.get("current_arc_id") or "arc_001_academy_start"
    if isinstance(arc_id, str) and arc_id:
        required_files.append(f"story/arcs/{arc_id}.yaml")
    location_id = current_state.get("current_location_id") or "loc_academy_main"
    add_location_files(required_files, location_id)
    selected = selected_character_ids(current_state)
    add_character_files(required_files, selected["full"], level="full")
    add_character_files(required_files, selected["reference"], level="light")
    for character_id in selected["full"]:
        if should_load_goals(current_state, character_id):
            add_character_files(required_files, [character_id], level="goals")
        if should_load_details(current_state, character_id):
            add_character_files(required_files, [character_id], level="details")
    if mode in {"technical", "audit", "transfer"}:
        required_files.extend(TECHNICAL_EXTRA_FILES)
    if mode in {"audit", "transfer"}:
        required_files.extend(AUDIT_EXTRA_FILES)
    return unique(required_files)


def relationship_participants(key: str, value: Any) -> list[str]:
    if isinstance(value, dict):
        for field in ("characters", "participants", "character_ids"):
            ids = as_id_list(value.get(field))
            if ids:
                return ids
    return unique(re.findall(r"char_[A-Za-z0-9_]+", key))


def build_relationship_slice(session_id: str, scene_ids: list[str]) -> dict[str, Any]:
    relationships = read_json_state(session_id, "relationships.json")
    result: dict[str, Any] = {}
    for key, value in relationships.items():
        participants = relationship_participants(key, value)
        if len([cid for cid in participants if cid in scene_ids]) >= 2:
            result[key] = value
    return result


def build_knowledge_slice(session_id: str, scene_ids: list[str]) -> dict[str, Any]:
    knowledge = read_json_state(session_id, "knowledge_state.json")
    return {cid: knowledge.get(cid, {}) for cid in scene_ids if cid in knowledge}


def build_open_threads_slice(session_id: str, scene_ids: list[str]) -> dict[str, Any]:
    open_threads = read_json_state(session_id, "open_threads.json")
    result: dict[str, Any] = {}
    for key, value in open_threads.items():
        if not isinstance(value, dict):
            continue
        status = value.get("status", "open")
        participants = as_id_list(value.get("participants")) or as_id_list(value.get("character_ids"))
        if status in {"closed", "resolved", "archived"}:
            continue
        if participants and any(cid in scene_ids for cid in participants):
            result[key] = value
        elif not participants and len(result) < 8:
            result[key] = value
    return result


def build_shared_incidents_slice(session_id: str, scene_ids: list[str]) -> dict[str, Any]:
    incidents = read_json_state(session_id, "shared_incidents.json")
    result: dict[str, Any] = {}
    for key, value in incidents.items():
        if not isinstance(value, dict):
            continue
        participants = unique(as_id_list(value.get("participants")) + as_id_list(value.get("witnesses")) + as_id_list(value.get("known_by")))
        status = value.get("status", "active_reference")
        if participants and any(cid in scene_ids for cid in participants) and status != "archived":
            result[key] = value
        if len(result) >= 10:
            break
    return result


def extract_calendar_day_block(calendar_text: str, day_id: str | None, date: str | None) -> str:
    lines = calendar_text.splitlines()
    start: int | None = None
    if day_id:
        pattern = f"  {day_id}:"
        for i, line in enumerate(lines):
            if line.startswith(pattern):
                start = i
                break
    if start is None and date:
        for i, line in enumerate(lines):
            if f'date: "{date}"' in line or f"date: '{date}'" in line or f"date: {date}" in line:
                for j in range(i, -1, -1):
                    if re.match(r"^  [A-Za-z0-9_]+:\s*$", lines[j]):
                        start = j
                        break
                break
    if start is None:
        return ""
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if re.match(r"^  [A-Za-z0-9_]+:\s*$", lines[j]):
            end = j
            break
    return "\n".join(lines[start:end])


def build_calendar_slice(session_id: str, current_state: dict[str, Any]) -> dict[str, Any]:
    calendar_id = current_state.get("current_calendar_id") or "academy_start"
    current_day_id = current_state.get("current_day_id")
    current_date = current_state.get("current_date")
    source_file = f"story/calendar/{calendar_id}.yaml"
    calendar_text = safe_read_text(source_file, session_id, max_chars=50000)
    day_block = extract_calendar_day_block(calendar_text, current_day_id if isinstance(current_day_id, str) else None, current_date if isinstance(current_date, str) else None)
    protocol = ""
    if "calendar_reading_protocol:" in calendar_text:
        protocol = trim_text(calendar_text.split("\ndays:", 1)[0], 2500)
    return {
        "source_file": source_file,
        "calendar_id": calendar_id,
        "current_day_id": current_day_id,
        "current_date": current_date,
        "protocol": protocol,
        "current_day_block": trim_text(day_block, 6000),
        "selection_rule": "Use only current_day_block for this turn unless the player explicitly skips time or asks for calendar audit.",
    }


def build_current_frame(current_state: dict[str, Any]) -> dict[str, Any]:
    pov_id = current_state.get("pov_character_id", "char_akira")
    status = {}
    if isinstance(current_state.get("character_status"), dict):
        status = current_state.get("character_status", {}).get(pov_id, {}) or {}
    return {
        "date": current_state.get("current_date"),
        "day_of_week": current_state.get("current_day_of_week"),
        "time": current_state.get("current_time"),
        "time_of_day": current_state.get("time_of_day"),
        "location_id": current_state.get("current_location_id"),
        "arc_id": current_state.get("current_arc_id"),
        "calendar_id": current_state.get("current_calendar_id"),
        "day_id": current_state.get("current_day_id"),
        "weather": current_state.get("weather", {}),
        "pov_character_id": pov_id,
        "pov_status": status,
        "active_character_ids": as_id_list(current_state.get("active_character_ids")),
        "nearby_character_ids": as_id_list(current_state.get("nearby_character_ids")),
        "mentioned_character_ids": as_id_list(current_state.get("mentioned_character_ids")),
        "scheduled_character_ids": as_id_list(current_state.get("scheduled_character_ids")),
        "delayed_character_ids": as_id_list(current_state.get("delayed_character_ids")),
    }


def response_format_contract() -> dict[str, Any]:
    return {
        "priority": "highest_for_scene_output",
        "scene_header_required": True,
        "header_max_lines": 6,
        "header_required_data": ["date + day_of_week + time", "location", "weather", "short POV physical/state line", "nearby/active characters only when present"],
        "header_rules": ["Keep header short.", "Do not list absent items.", "Write item line only if a relevant item is present."],
        "dialogue_format": "**Имя или видимый дескриптор** — Реплика. (*короткая ремарка: тон, взгляд, пауза, жест*)",
        "description_format": "*Описание действия, окружения или атмосферы отдельной строкой курсивом.*",
        "scene_body_rules": ["Use visible POV only.", "No direct inner thoughts in scene body.", "NPC thoughts are not facts.", "Known names only after POV knows them.", "Descriptions and atmosphere go as separate italic paragraphs.", "Dialogue uses bold speaker tag and long dash."],
        "ending_block": ["━━━━━━━━━━━━━━━━━━━━", "Что можно сделать:", "1.", "2.", "3.", "", "Что сказать:", "— “...”", "— “...”", "— “...”", "", "Мысли Акиры:", "— ...", "— ...", "— ...", "━━━━━━━━━━━━━━━━━━━━"],
        "self_check": "If the response is not in this format, rewrite it before sending.",
    }


def scene_density_contract() -> dict[str, Any]:
    return {
        "target_scene_beats": "3-5",
        "minimum_for_meaningful_scene": ["environment or academy system in motion", "visible POV observation, not passive empty standing", "at least one active/nearby character reaction or pressure", "one concrete change: knowledge, position, tension, schedule, access, reputation, body/clothing state or open thread", "stop at a real intervention point"],
        "do_not_stop_after": ["pure scenery setup", "one vague question with no pressure", "a decorative weather sentence only"],
        "allowed_short_scene": "Only for pure transition with no event; then summarize and move to nearest meaningful beat.",
    }


def build_scene_contract(session_id: str, current_state: dict[str, Any], mode: str) -> dict[str, Any]:
    selected = selected_character_ids(current_state)
    scene_ids = unique(selected["full"])
    arc_id = current_state.get("current_arc_id") or "arc_001_academy_start"
    arc_file = f"story/arcs/{arc_id}.yaml"
    location_id = current_state.get("current_location_id") or "loc_academy_main"
    location_files = LOCATION_REQUIRED_FILES.get(location_id, [])
    return {
        "version": "scene_contract_v1",
        "mode": mode,
        "current_frame": build_current_frame(current_state),
        "calendar_slice": build_calendar_slice(session_id, current_state),
        "arc_slice": {"source_file": arc_file, "content": safe_read_text(arc_file, session_id, max_chars=5000)},
        "location_slice": {"location_id": location_id, "source_files": location_files, "content": {path: safe_read_text(path, session_id, max_chars=2500) for path in location_files}},
        "character_load_plan": {"full_character_ids": selected["full"], "reference_character_ids": selected["reference"], "full_rule": "Full files are loaded only for POV/active/nearby characters.", "reference_rule": "Mentioned/scheduled/delayed characters use light info unless they enter the scene."},
        "relationship_slice": build_relationship_slice(session_id, scene_ids),
        "knowledge_slice": build_knowledge_slice(session_id, scene_ids),
        "open_threads_slice": build_open_threads_slice(session_id, scene_ids),
        "shared_incidents_slice": build_shared_incidents_slice(session_id, scene_ids),
        "response_format_contract": response_format_contract(),
        "scene_density_contract": scene_density_contract(),
        "selection_rules": ["Do not load every project file for a normal scene.", "Use current calendar day only unless time skip/audit requires more.", "Use full character files only for POV/active/nearby characters.", "Use light character info for mentioned/scheduled/delayed characters.", "Use relationships, knowledge and incidents only for characters present or directly affecting the current beat."],
    }


@app.on_event("startup")
def startup() -> None:
    ensure_runtime_root()


@app.get("/")
def root() -> dict[str, Any]:
    return {"status": "ok", "project": PROJECT_SLUG, "version": "3.1.0", "actions_schema": "/openapi-actions.json", "health": "/health", "debug_volume": "/debug/volume"}


@app.get("/health")
def health() -> dict[str, Any]:
    return {"success": True, "project": PROJECT_SLUG, "version": "3.1.0", "time": utc_now()}


@app.get("/debug/volume")
def debug_volume() -> dict[str, Any]:
    try:
        return {"success": True, **debug_info()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/v1/sessions")
def create_session(req: CreateSessionRequest | None = None) -> dict[str, Any]:
    req = req or CreateSessionRequest()
    sid, root_dir = ensure_session(req.session_id, reset=req.reset)
    return {"success": True, "session_id": sid, "session_root": str(root_dir), "state_root": str(session_state_root(sid)), "reset": req.reset, "next": {"turn_contract": f"/api/v1/sessions/{sid}/turn-contract"}}


@app.post("/api/v1/sessions/{session_id}/turn-contract")
def get_turn_contract(session_id: str, req: TurnContractRequest) -> dict[str, Any]:
    sid, _ = ensure_session(session_id, reset=False)
    current_state = read_json_state(sid, "current_state.json")
    required_files = build_required_files(current_state, req.mode)
    scene_contract = build_scene_contract(sid, current_state, req.mode)
    contents: dict[str, Any] = {}
    if req.include_file_contents:
        for path in required_files:
            try:
                contents[path] = trim(read_project_or_runtime_file(path, sid))
            except Exception as exc:
                contents[path] = {"error": str(exc), "truncated": False, "chars": 0, "content": ""}
    return {"success": True, "session_id": sid, "mode": req.mode, "is_game_turn": req.mode == "play", "current_state": current_state, "scene_contract": scene_contract, "required_files": required_files, "required_file_contents": contents, "checks": ["Use scene_contract first; required_files are support, not the whole project.", "Use current calendar slice only unless time skip/audit requires more.", "Use full character files only for POV/active/nearby characters.", "Use light info for mentioned/scheduled/delayed characters.", "Use relationship/knowledge slices from scene_contract before NPC claims.", "Obey response_format_contract and scene_density_contract.", "After a meaningful scene, call applyTurnResult or applyTurnResultSimple."]}


@app.post("/api/v1/sessions/{session_id}/apply-turn-result")
def apply_turn_result(session_id: str, req: ApplyTurnResultRequest) -> dict[str, Any]:
    sid, _ = ensure_session(session_id, reset=False)
    state_root = session_state_root(sid)
    if req.technical:
        append_jsonl(session_root(sid) / "technical_history.jsonl", {"time": utc_now(), "scene_id": req.scene_id, "text": req.scene_text})
        return {"success": True, "status": "technical_saved", "session_id": sid}
    append_jsonl(state_root / "scene_history.jsonl", {"time": utc_now(), "scene_id": req.scene_id, "scene_text": req.scene_text})
    patch_map = [("current_state.json", req.current_state_changes), ("knowledge_state.json", req.knowledge_changes), ("relationships.json", req.relationship_changes), ("open_threads.json", req.open_thread_changes), ("shared_incidents.json", req.shared_incident_changes), ("inventory_state.json", req.inventory_changes)]
    updated = ["scene_history.jsonl"]
    for filename, patch in patch_map:
        if patch:
            write_json_state(sid, filename, patch)
            updated.append(filename)
    for character_id, patch in req.character_memory_changes.items():
        if isinstance(patch, dict):
            path = state_root / "character_memory" / f"{character_id}.json"
            current = read_json(path, {})
            if not isinstance(current, dict):
                current = {}
            deep_merge(current, patch)
            current.setdefault("character_id", character_id)
            current["updated_at"] = utc_now()
            write_json_atomic(path, current)
            updated.append(f"character_memory/{character_id}.json")
    compaction = read_json_state(sid, "compaction_state.json")
    compaction["total_game_turns"] = int(compaction.get("total_game_turns", 0) or 0) + 1
    compaction["since_last_compaction"] = int(compaction.get("since_last_compaction", 0) or 0) + 1
    compaction["compact_every_turns"] = int(compaction.get("compact_every_turns", COMPACT_EVERY_TURNS) or COMPACT_EVERY_TURNS)
    compaction["needs_compaction"] = compaction["since_last_compaction"] >= compaction["compact_every_turns"]
    compaction["last_scene_id"] = req.scene_id
    compaction["updated_at"] = utc_now()
    write_state(sid, "compaction_state.json", compaction)
    updated.append("compaction_state.json")
    return {"success": True, "session_id": sid, "updated_files": updated, "needs_compaction": compaction.get("needs_compaction", False)}


@app.post("/api/v1/sessions/{session_id}/apply-turn-result-simple")
def apply_turn_result_simple(session_id: str, req: ApplyTurnResultSimpleRequest) -> dict[str, Any]:
    return apply_turn_result(session_id, ApplyTurnResultRequest(scene_id=req.scene_id, scene_text=req.scene_text, technical=req.technical, current_state_changes=parse_json_text(req.current_state_changes_json), knowledge_changes=parse_json_text(req.knowledge_changes_json), relationship_changes=parse_json_text(req.relationship_changes_json), open_thread_changes=parse_json_text(req.open_thread_changes_json), shared_incident_changes=parse_json_text(req.shared_incident_changes_json), inventory_changes=parse_json_text(req.inventory_changes_json), character_memory_changes=parse_json_text(req.character_memory_changes_json)))


@app.post("/api/v1/sessions/{session_id}/compact")
def compact_session(session_id: str, req: CompactRequest) -> dict[str, Any]:
    sid, _ = ensure_session(session_id, reset=False)
    if req.recent_turns_md is not None:
        write_state(sid, "recent_turns.md", req.recent_turns_md)
    for filename, patch in req.state_updates.items():
        if isinstance(patch, dict) and filename.endswith(".json"):
            write_json_state(sid, filename, patch)
    compaction = read_json_state(sid, "compaction_state.json")
    compaction["last_compaction_at"] = utc_now()
    compaction["last_compaction_reason"] = req.reason
    compaction["since_last_compaction"] = 0
    compaction["needs_compaction"] = False
    write_state(sid, "compaction_state.json", compaction)
    return {"success": True, "session_id": sid, "status": "compacted"}


@app.get("/api/v1/sessions/{session_id}/state/{filename}")
def read_session_state_file(session_id: str, filename: str) -> PlainTextResponse:
    try:
        safe_filename = safe_repo_path(filename)
        text = read_project_or_runtime_file(f"state/{safe_filename}", session_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return PlainTextResponse(text)


@app.get("/api/v1/files/{file_path:path}")
def read_file(file_path: str, session_id: str | None = None) -> PlainTextResponse:
    try:
        text = read_project_or_runtime_file(safe_repo_path(file_path), session_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return PlainTextResponse(text)


@app.get("/openapi-actions.json")
def openapi_actions() -> dict[str, Any]:
    server = PUBLIC_BASE_URL or "https://your-service.up.railway.app"
    return {
        "openapi": "3.1.0",
        "info": {"title": f"{PROJECT_SLUG} GPT Actions", "version": "3.1.0"},
        "servers": [{"url": server}],
        "paths": {
            "/health": {"get": {"operationId": "healthCheck", "summary": "Check API health", "responses": {"200": {"description": "OK"}}}},
            "/debug/volume": {"get": {"operationId": "debugVolume", "summary": "Check runtime volume", "responses": {"200": {"description": "OK"}}}},
            "/api/v1/sessions": {"post": {"operationId": "createSession", "summary": "Create a new runtime session", "requestBody": {"required": False, "content": {"application/json": {"schema": CreateSessionRequest.model_json_schema()}}}, "responses": {"200": {"description": "Session created"}}}},
            "/api/v1/sessions/{session_id}/turn-contract": {"post": {"operationId": "getSessionTurnContract", "summary": "Get smart scene contract, selected files and runtime state for one turn", "parameters": [{"name": "session_id", "in": "path", "required": True, "schema": {"type": "string"}}], "requestBody": {"required": True, "content": {"application/json": {"schema": TurnContractRequest.model_json_schema()}}}, "responses": {"200": {"description": "Smart turn contract"}}}},
            "/api/v1/files/{file_path}": {"get": {"operationId": "getProjectFile", "summary": "Read one project or runtime file by path", "parameters": [{"name": "file_path", "in": "path", "required": True, "schema": {"type": "string"}}, {"name": "session_id", "in": "query", "required": False, "schema": {"type": "string"}}], "responses": {"200": {"description": "Project or runtime file"}}}},
            "/api/v1/sessions/{session_id}/apply-turn-result": {"post": {"operationId": "applyTurnResult", "summary": "Persist scene and state changes", "parameters": [{"name": "session_id", "in": "path", "required": True, "schema": {"type": "string"}}], "requestBody": {"required": True, "content": {"application/json": {"schema": ApplyTurnResultRequest.model_json_schema()}}}, "responses": {"200": {"description": "Saved"}}}},
            "/api/v1/sessions/{session_id}/apply-turn-result-simple": {"post": {"operationId": "applyTurnResultSimple", "summary": "Persist scene and state changes using JSON strings for GPT Actions", "parameters": [{"name": "session_id", "in": "path", "required": True, "schema": {"type": "string"}}], "requestBody": {"required": True, "content": {"application/json": {"schema": ApplyTurnResultSimpleRequest.model_json_schema()}}}, "responses": {"200": {"description": "Saved"}}}},
            "/api/v1/sessions/{session_id}/compact": {"post": {"operationId": "compactSessionMemory", "summary": "Persist memory compaction", "parameters": [{"name": "session_id", "in": "path", "required": True, "schema": {"type": "string"}}], "requestBody": {"required": True, "content": {"application/json": {"schema": CompactRequest.model_json_schema()}}}, "responses": {"200": {"description": "Compacted"}}}},
            "/api/v1/sessions/{session_id}/state/{filename}": {"get": {"operationId": "getSessionStateFile", "summary": "Read one runtime state file", "parameters": [{"name": "session_id", "in": "path", "required": True, "schema": {"type": "string"}}, {"name": "filename", "in": "path", "required": True, "schema": {"type": "string"}}], "responses": {"200": {"description": "State file"}}}},
        },
    }
