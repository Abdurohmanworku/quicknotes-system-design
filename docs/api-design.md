# QuickNotes API Design

This document describes the real QuickNotes REST API that the backend team should build. It is not the JSONPlaceholder practice API used by the client in this repository.

- **Base URL:** `https://api.quicknotes.example/v1`
- **Format:** all request and response bodies are JSON (`Content-Type: application/json`).
- **Authentication:** every endpoint except `POST /auth/login` needs the header `Authorization: Bearer <token>`.
- **Ownership:** a user can only see and change their own notes and tags.

## Endpoints

| # | Method | Path | Description | Success status |
|---|--------|------|-------------|----------------|
| 1 | `POST` | `/auth/login` | Log in with email and password and receive a token. | `200 OK` |
| 2 | `GET` | `/notes` | List the current user's notes (supports `?tag=`, `?q=`, `?page=`, `?limit=`). | `200 OK` |
| 3 | `GET` | `/notes/{id}` | Get one note by its id. | `200 OK` |
| 4 | `POST` | `/notes` | Create a new note. | `201 Created` |
| 5 | `PUT` | `/notes/{id}` | Replace a note's title, body and tags. | `200 OK` |
| 6 | `DELETE` | `/notes/{id}` | Delete a note. | `204 No Content` |
| 7 | `GET` | `/tags` | List the current user's tags. | `200 OK` |
| 8 | `POST` | `/notes/{id}/tags` | Attach a tag to a note (creates the tag if it is new). | `201 Created` |
| 9 | `DELETE` | `/notes/{id}/tags/{tagId}` | Remove a tag from a note. | `204 No Content` |

## Examples

### Create a note: `POST /notes`

**Request body**

```json
{
  "title": "Team meeting agenda",
  "body": "Discuss the launch date and the budget.",
  "tags": ["work"]
}
```

**Response: `201 Created`**

```json
{
  "id": 42,
  "title": "Team meeting agenda",
  "body": "Discuss the launch date and the budget.",
  "tags": ["work"],
  "userId": 1,
  "createdAt": "2026-10-25T09:30:00Z",
  "updatedAt": "2026-10-25T09:30:00Z"
}
```

The response also includes the header `Location: /v1/notes/42`.

### List notes: `GET /notes?tag=work&page=1&limit=2`

**Response: `200 OK`**

```json
{
  "data": [
    {
      "id": 42,
      "title": "Team meeting agenda",
      "body": "Discuss the launch date and the budget.",
      "tags": ["work"],
      "createdAt": "2026-10-25T09:30:00Z"
    },
    {
      "id": 37,
      "title": "Send the project report",
      "body": "Email it to Grace before Friday.",
      "tags": ["work"],
      "createdAt": "2026-10-24T14:05:00Z"
    }
  ],
  "page": 1,
  "limit": 2,
  "total": 5
}
```

If the user has no notes, the API still returns `200 OK` with `"data": []` and `"total": 0`.

## Error responses

Every error uses the same JSON shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The title is required and must be 100 characters or fewer.",
    "details": [
      { "field": "title", "problem": "must not be empty" }
    ]
  }
}
```

| Status | Meaning | Example of when it happens | Example `error.code` |
|--------|---------|----------------------------|----------------------|
| `400 Bad Request` | The request is invalid or malformed. | `POST /notes` with an empty title, a title over 100 characters, or broken JSON. | `VALIDATION_ERROR` |
| `401 Unauthorized` | The user is not logged in, or the token is missing, expired or invalid. | `GET /notes` with no `Authorization` header. | `UNAUTHENTICATED` |
| `403 Forbidden` | The user is logged in but is not allowed to do this. | User A tries `DELETE /notes/42`, but note 42 belongs to user B. | `FORBIDDEN` |
| `404 Not Found` | The note, tag or path does not exist. | `GET /notes/9999` when no note has the id 9999. | `NOT_FOUND` |
| `500 Internal Server Error` | Something went wrong on the server. | The database is down while handling `POST /notes`. | `INTERNAL_ERROR` |

**Example 401 body**

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Your session has expired. Please log in again."
  }
}
```

**Example 404 body**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No note with id 9999 was found."
  }
}
```

**Example 500 body**

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Something went wrong on our side. Please try again later."
  }
}
```

The 500 body never includes internal details such as stack traces or database messages.
