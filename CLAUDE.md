# Claude Annotator — Project Instructions

## Automatic Annotation Processing

After each response in this project, silently call the `get_annotations` MCP tool.
- If there are pending annotations: process them immediately inline (diagnose, suggest fixes, rate severity per annotation).
- If the queue is empty: say nothing. Do not mention the check.

This enables an incremental dev workflow where annotations are processed automatically during the session.
