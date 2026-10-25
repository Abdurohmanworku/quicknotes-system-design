// ---------- Settings ----------
const API_URL = "https://jsonplaceholder.typicode.com/posts";
const MAX_TITLE_LENGTH = 100;

// ---------- Select elements ----------
const loadBtn = document.querySelector("#load-btn");
const statusText = document.querySelector("#status");
const noteForm = document.querySelector("#note-form");
const titleInput = document.querySelector("#title-input");
const bodyInput = document.querySelector("#body-input");
const submitBtn = document.querySelector("#submit-btn");
const notesList = document.querySelector("#notes-list");

// The notes currently shown on the page.
// NOTE ON JSONPlaceholder: it is a practice API that only PRETENDS to save data.
// A POST returns a fake note (always with id 101) but nothing is stored, and a
// later GET will never include it. A DELETE returns success but nothing is removed.
// So after a successful POST or DELETE I update this local array and redraw the
// list myself instead of loading the notes from the server again. If I reloaded,
// created notes would vanish and deleted notes would come back. Because every
// created note gets the same fake id (101), I also remove notes by object
// reference rather than by id, so deleting one never removes another.
let notes = [];
let isBusy = false;

// ---------- Helpers ----------

// Show a message. type is "loading", "success" or "error".
function setStatus(message, type) {
  statusText.textContent = message;
  statusText.className = type ? `status-${type}` : "";
}

// Disable (or enable) every button while a request is running.
function setBusy(busy) {
  isBusy = busy;
  loadBtn.disabled = busy;
  submitBtn.disabled = busy;
  document.querySelectorAll(".delete-btn").forEach(function (button) {
    button.disabled = busy;
  });
}

// One reusable function for every request: calls fetch, checks response.ok,
// and throws an error if the server did not answer with a success status.
async function request(url, options = {}) {
  const headers = options.body
    ? { "Content-Type": "application/json; charset=UTF-8" }
    : {};

  const response = await fetch(url, { ...options, headers: headers });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { data: data, status: response.status };
}

// ---------- Drawing the list (user text uses textContent only) ----------
function createNoteCard(note) {
  const li = document.createElement("li");
  li.classList.add("note");

  const title = document.createElement("h3");
  title.textContent = note.title;

  const body = document.createElement("p");
  body.textContent = note.body ? note.body : "(no body)";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.classList.add("delete-btn");
  deleteBtn.textContent = "Delete";
  deleteBtn.disabled = isBusy;
  deleteBtn.addEventListener("click", function () {
    deleteNote(note);
  });

  li.append(title, body, deleteBtn);
  return li;
}

function renderNotes() {
  notesList.replaceChildren();

  // Empty state
  if (notes.length === 0) {
    const li = document.createElement("li");
    li.classList.add("empty-state");
    li.textContent = "No notes to show. Click \"Load notes\" or add one above.";
    notesList.append(li);
    return;
  }

  notes.forEach(function (note) {
    notesList.append(createNoteCard(note));
  });
}

// ===== Task 1: GET (load 10 notes) =====
async function loadNotes() {
  setStatus("Loading notes...", "loading");
  setBusy(true);

  try {
    const result = await request(`${API_URL}?_limit=10`);
    notes = result.data;
    renderNotes();

    if (notes.length === 0) {
      setStatus("The server has no notes to show.", "success");
    } else {
      const word = notes.length === 1 ? "note" : "notes";
      setStatus(`Loaded ${notes.length} ${word} from the server.`, "success");
    }
  } catch (error) {
    console.error(error);
    setStatus("Sorry, the notes could not be loaded. Please check your connection and try again.", "error");
  } finally {
    setBusy(false);
  }
}

// ===== Task 2: POST (create a note) =====
async function createNote(event) {
  event.preventDefault();

  // Validation: title required, max 100 characters. Body is optional.
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (title === "") {
    setStatus("Please enter a title.", "error");
    return;
  }
  if (title.length > MAX_TITLE_LENGTH) {
    setStatus(`The title must be ${MAX_TITLE_LENGTH} characters or fewer.`, "error");
    return;
  }

  setStatus("Creating note...", "loading");
  setBusy(true);

  try {
    const result = await request(API_URL, {
      method: "POST",
      body: JSON.stringify({ title: title, body: body, userId: 1 }),
    });

    // Add the note returned by the server to the TOP of the list.
    notes.unshift({
      id: result.data.id,
      title: result.data.title,
      body: result.data.body,
      userId: result.data.userId,
    });
    renderNotes();

    noteForm.reset();
    setStatus(`Note created (status ${result.status}, id ${result.data.id}).`, "success");
  } catch (error) {
    console.error(error);
    setStatus("Sorry, the note could not be created. Please try again.", "error");
  } finally {
    setBusy(false);
  }
}

// ===== Task 3: DELETE (remove a note) =====
async function deleteNote(note) {
  setStatus("Deleting note...", "loading");
  setBusy(true);

  try {
    const result = await request(`${API_URL}/${note.id}`, { method: "DELETE" });

    // Remove only this exact note (see the comment at the top of the file).
    notes = notes.filter(function (item) {
      return item !== note;
    });
    renderNotes();

    setStatus(`Note deleted (status ${result.status}).`, "success");
  } catch (error) {
    console.error(error);
    setStatus("Sorry, the note could not be deleted. Please try again.", "error");
  } finally {
    setBusy(false);
  }
}

// ---------- Events and start ----------
loadBtn.addEventListener("click", loadNotes);
noteForm.addEventListener("submit", createNote);

renderNotes();
