# QuickNotes System Design

QuickNotes started as a browser-only note-taking app. This project imagines the next step: turning it into an online service for 1 million users. It has two parts. The first is a small API client that uses `fetch` to load, create and delete notes through the JSONPlaceholder practice API. The second is a set of design documents that the backend team could build from: a REST API design, a database model and a full system architecture with load estimates.

## Features of the API client

- **Load notes (GET):** fetches 10 notes and shows each title and body
- **Create a note (POST):** sends the title, body and `userId` as JSON and adds the returned note to the top of the list
- **Delete a note (DELETE):** removes a note after the server confirms it
- Loading, success, error and empty states shown on the page
- Validation: the title is required and can be at most 100 characters
- Buttons are disabled while a request is running
- All text from the server or the user is inserted with `textContent`, never `innerHTML`

## How to run the API client

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/quicknotes-system-design.git
   ```
2. Open the folder in VS Code.
3. Right-click `index.html` and choose **Open with Live Server** (or double-click `index.html` to open it in your browser).
4. Click **Load notes**, then try adding and deleting notes.

You need an internet connection, because the client calls `https://jsonplaceholder.typicode.com/posts`. JSONPlaceholder only pretends to save data, so created notes are not stored on the server and a deleted note will come back if you load the notes again. The code comments explain how the client handles this.

## Design documents

- [API design](docs/api-design.md): REST endpoints, JSON examples and error codes
- [Data model](docs/data-model.md): tables, relationships, SQL, indexes and the SQL vs NoSQL decision
- [Architecture](docs/architecture.md): requirements, load estimate, diagram, request flows, trade-offs and single points of failure

## Project structure

```
quicknotes-system-design/
├── index.html
├── api.js
├── style.css
├── README.md
└── docs/
    ├── api-design.md
    ├── data-model.md
    └── architecture.md
```

## What I learned

- How to write one reusable `request()` function that calls `fetch`, checks `response.ok` and throws on errors, so that GET, POST and DELETE all share the same error handling.
- How to show loading, success, error and empty states, and why buttons should be disabled while a request is running.
- How a REST API is designed around resources, with the right methods and status codes (`201` for create, `204` for delete, `400`, `401`, `403`, `404` and `500` for errors).
- Why a many-to-many relationship, such as notes and tags, needs a join table.
- How to estimate load (requests per second and storage per year) and decide whether a system is read-heavy or write-heavy.
- How a cache, a read replica, a queue and a load balancer each solve a different scaling problem, and how redundancy removes single points of failure.
