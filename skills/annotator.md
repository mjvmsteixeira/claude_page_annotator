---
name: annotator
description: Fetch and process pending web page annotations from the Claude Annotator extension
user-invocable: true
---

Call the `get_annotations` MCP tool and process the result.

If there are pending annotations, for each one provide:
1. Diagnosis — what is wrong or can be improved
2. Fixed code (if applicable)
3. Explanation of the fix
4. Severity: Critical / Important / Suggestion

Address annotations in order. Match the response language to the annotation content (PT or EN).

If the queue is empty, respond: "Sem anotações pendentes." (PT) or "No pending annotations." (EN).
