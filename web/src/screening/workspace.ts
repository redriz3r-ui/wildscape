import type { Project } from "./types";
import { esc } from "./utils";
import { loadProjects, persist, restoreProject } from "./model";

interface Workspace {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
}
interface Session {
  setupAllowed?: boolean;
  user: { id: number; email: string } | null;
  workspaces: Workspace[];
  csrfToken: string;
}
interface StoredProject {
  id: string;
  data: Project;
  version: number;
  updatedAt: string;
  updatedBy: string;
}
export class WorkspaceStore {
  session?: Session;
  workspace?: Workspace;
  private csrf = "";
  private versions = new Map<string, number>();
  private snapshots = new Map<string, string>();
  private chain: Promise<void> = Promise.resolve();
  private pending = 0;
  private failed = false;
  private lastProjects: Project[] = [];
  onState: (message: string) => void = () => {};
  get cloud() {
    return !!this.workspace;
  }
  get editable() {
    return !this.workspace || this.workspace.role !== "viewer";
  }
  get label() {
    return this.workspace
      ? `${this.workspace.name} · ${this.workspace.role}`
      : "Local demo · browser storage";
  }
  constructor() {
    window.addEventListener("beforeunload", (event) => {
      if (this.pending || this.failed) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
  }
  private async request<T>(
    path: string,
    method = "GET",
    data?: unknown,
  ): Promise<T> {
    const result = await fetch(`/api/${path}`, {
      method,
      credentials: "same-origin",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        ...(method !== "GET" ? { "X-CSRFToken": this.csrf } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const body = await result
      .json()
      .catch(() => ({ error: "Workspace service unavailable." }));
    if (!result.ok) throw Error(body.error || "Workspace service unavailable.");
    if (body.csrfToken) this.csrf = body.csrfToken;
    return body as T;
  }
  async open(root: HTMLElement): Promise<void> {
    const required =
      import.meta.env.VITE_REQUIRE_ACCOUNT === "true" ||
      sessionStorage.getItem("wildscape-cloud-mode") === "true" ||
      new URLSearchParams(location.search).has("workspace");
    const invitation = new URLSearchParams(location.hash.slice(1)).get(
      "invite",
    );
    const reset = new URLSearchParams(location.hash.slice(1)).get("reset");
    try {
      this.session = await this.request<Session>("session/");
    } catch (error) {
      if (required || invitation || reset)
        throw Error(
          "The workspace service is unavailable. Your server projects have not been replaced with local data.",
        );
      return;
    }
    if (reset) {
      await this.recover(root, reset);
      this.session = await this.request<Session>("session/");
    }
    if (invitation || (!this.session.user && (required || !!reset)))
      await this.signIn(root, invitation);
    if (!this.session?.user) return;
    const chosen = sessionStorage.getItem("wildscape-workspace-id");
    this.workspace =
      this.session.workspaces.find((w) => w.id === chosen) ||
      this.session.workspaces[0];
    if (!this.workspace)
      throw Error(
        "Your account has no workspace. Ask your consultancy owner for an invitation.",
      );
    sessionStorage.setItem("wildscape-workspace-id", this.workspace.id);
    sessionStorage.setItem("wildscape-cloud-mode", "true");
  }
  private recover(root: HTMLElement, token: string | null): Promise<void> {
    return new Promise((resolve) => {
      root.innerHTML = `<main class="account-screen"><p class="eyebrow">WILDSCAPE / ACCOUNT RECOVERY</p><h1>${token ? "Choose a new password" : "Reset your password"}</h1><form>${token ? '<label>New password<input name="password" type="password" autocomplete="new-password" required minlength="12"></label>' : '<label>Email<input name="email" type="email" autocomplete="email" required></label>'}<button>${token ? "Save new password" : "Request recovery email"}</button></form><p id="recovery-status" role="status"></p><button id="back-login">Back to sign in</button></main>`;
      root
        .querySelector("#back-login")!
        .addEventListener("click", () => resolve());
      root.querySelector("form")!.onsubmit = async (event) => {
        event.preventDefault();
        const form = event.target as HTMLFormElement;
        const button = form.querySelector("button")!;
        button.disabled = true;
        try {
          const data = new FormData(form);
          await this.request(
            token ? "password/reset/" : "password/request-reset/",
            "POST",
            token
              ? { token, password: data.get("password") }
              : { email: data.get("email") },
          );
          if (token) {
            history.replaceState(null, "", location.pathname + location.search);
            resolve();
          } else
            root.querySelector("#recovery-status")!.textContent =
              "If this email has an account, a recovery link will be sent. The link expires in one hour.";
        } catch (error) {
          root.querySelector("#recovery-status")!.textContent = String(
            error instanceof Error ? error.message : error,
          );
        } finally {
          button.disabled = false;
        }
      };
    });
  }
  private signIn(root: HTMLElement, invitation: string | null): Promise<void> {
    return new Promise((resolve) => {
      const draw = (invite: boolean) => {
        const setup = !invite && this.session?.setupAllowed;
        root.innerHTML = `<main class="account-screen"><p class="eyebrow">WILDSCAPE / CONSULTANCY WORKSPACE</p><h1>${invite ? "Join your team" : setup ? "Create your first workspace" : "Sign in to WildScape"}</h1><p>Habitat and species screening, field evidence, and a shared record of professional review.</p><form id="account-login">${setup ? '<label>Consultancy / workspace name<input name="name" required maxlength="180"></label>' : ""}${invite ? "" : '<label>Email<input type="email" name="email" autocomplete="username" required></label>'}<label>${invite || setup ? "Create a password (12+ characters)" : "Password"}<input type="password" name="password" autocomplete="${invite || setup ? "new-password" : "current-password"}" required ${invite || setup ? 'minlength="12"' : ""}></label><button class="primary">${invite ? "Accept invitation" : setup ? "Create workspace" : "Sign in"}</button></form><p role="alert" id="account-error"></p>${invite ? '<button id="existing-account">I already have an account</button>' : '<p>Access is provided by your workspace owner.</p><button id="forgot-password">Forgot password?</button>'}</main>`;
        root
          .querySelector("#forgot-password")
          ?.addEventListener("click", () => {
            void this.recover(root, null).then(() => draw(false));
          });
        root
          .querySelector("#existing-account")
          ?.addEventListener("click", () => draw(false));
        root.querySelector<HTMLFormElement>("form")!.onsubmit = async (
          event,
        ) => {
          event.preventDefault();
          const form = root.querySelector<HTMLFormElement>("form")!;
          const data = new FormData(form);
          const button = form.querySelector("button")!;
          button.disabled = true;
          try {
            this.session = await this.request<Session>(
              invite ? "invitations/accept/" : setup ? "setup/" : "login/",
              "POST",
              invite
                ? { token: invitation, password: data.get("password") }
                : {
                    email: data.get("email"),
                    password: data.get("password"),
                    name: data.get("name"),
                  },
            );
            if (!invite && invitation)
              this.session = await this.request<Session>(
                "invitations/accept/",
                "POST",
                { token: invitation },
              );
            history.replaceState(null, "", location.pathname + location.search);
            resolve();
          } catch (error) {
            root.querySelector("#account-error")!.textContent = String(
              error instanceof Error ? error.message : error,
            );
          } finally {
            button.disabled = false;
          }
        };
      };
      draw(!!invitation);
    });
  }
  async load(): Promise<Project[]> {
    if (!this.workspace) return loadProjects();
    const result = await this.request<{ projects: StoredProject[] }>(
      `workspaces/${this.workspace.id}/projects/`,
    );
    return result.projects.map((row) => {
      const p = restoreProject(row.data);
      this.versions.set(p.id, row.version);
      this.snapshots.set(p.id, JSON.stringify(p));
      return p;
    });
  }
  save(projects: Project[]) {
    if (!this.cloud) {
      persist(projects);
      this.onState("Saved locally in this browser");
      return;
    }
    if (!this.editable) {
      this.onState("Read-only workspace role");
      return;
    }
    this.lastProjects = structuredClone(projects);
    if (this.failed) {
      this.onState("Unsaved changes · open Team workspace for recovery");
      return;
    }
    const snapshot = structuredClone(projects);
    this.pending++;
    this.onState("Saving to workspace…");
    this.chain = this.chain
      .then(async () => {
        if (this.failed) return;
        for (const data of snapshot) {
          const serialized = JSON.stringify(data);
          if (serialized === this.snapshots.get(data.id)) continue;
          const version = this.versions.get(data.id);
          const base = `workspaces/${this.workspace!.id}/projects/`;
          const saved = await this.request<StoredProject>(
            version ? base + data.id + "/" : base,
            version ? "PUT" : "POST",
            { data, version },
          );
          this.versions.set(data.id, saved.version);
          this.snapshots.set(data.id, serialized);
        }
      })
      .catch((error) => {
        this.failed = true;
        this.onState(
          `Not saved: ${error.message} Open Team workspace for recovery.`,
        );
      })
      .finally(() => {
        this.pending--;
        if (!this.failed && !this.pending)
          this.onState(
            "Saved to workspace · " + new Date().toLocaleTimeString(),
          );
      });
  }
  async account(root: HTMLElement, project: Project) {
    if (!this.cloud) {
      location.assign("/?workspace=1");
      return;
    }
    const org = this.workspace!;
    const [members, audit] = await Promise.all([
      this.request<{ members: { id: number; email: string; role: string }[] }>(
        `workspaces/${org.id}/members/`,
      ),
      this.request<{
        events: {
          action: string;
          actor: string;
          at: string;
          version: number | null;
        }[];
      }>(`workspaces/${org.id}/audit/`),
    ]);
    const dialog = document.createElement("dialog");
    dialog.className = "workspace-dialog";
    dialog.setAttribute("aria-label", "Workspace " + org.name);
    dialog.innerHTML = `<button class="dialog-close" aria-label="Close workspace">×</button><p class="eyebrow">TEAM WORKSPACE</p><h2>${esc(org.name)}</h2><p>${esc(this.session!.user!.email)} · ${esc(org.role)}</p><label>Workspace<select id="switch-workspace">${this.session!.workspaces.map((w) => `<option value="${esc(w.id)}" ${w.id === org.id ? "selected" : ""}>${esc(w.name)}</option>`).join("")}</select></label><p role="status" id="team-status">${this.failed ? "Unsaved edits need recovery. Download your edits before reloading." : this.pending ? "Saving changes…" : "Projects are saved on the workspace server."}</p><button id="save-private">Download current edits (private)</button>${this.failed ? '<button id="retry-save">Retry save</button><button id="reload-server">Reload server version</button>' : ""}<h3>Team members</h3><table class="attribute-table"><thead><tr><th>Email</th><th>Role</th></tr></thead><tbody>${members.members.map((m) => `<tr><td>${esc(m.email)}</td><td>${esc(m.role)}${org.role === "owner" && m.role !== "owner" ? `<button data-remove-member="${m.id}">Remove access</button>` : ""}</td></tr>`).join("")}</tbody></table>${org.role === "owner" ? '<h3>Invite a teammate</h3><form id="invite-form"><label>Email<input name="email" type="email" required></label><label>Role<select name="role" aria-label="Role"><option value="editor">Editor — edit projects and field evidence</option><option value="viewer">Viewer — read and export workspace data</option></select></label><button>Create invitation link</button></form><p>All workspace members can access its project evidence, including sensitive data. Invite only authorized colleagues.</p><div id="invite-result"></div>' : ""}<h3>Project management</h3>${this.editable ? '<button id="archive-project">Archive current project</button>' : ""}<button id="list-archived">Show archived projects</button><div id="archived-list"></div><h3>Project revisions</h3><button id="load-revisions">Show saved revisions</button><div id="revision-list"></div><h3>Workspace activity</h3><div class="workspace-activity"><table class="attribute-table"><thead><tr><th>Event</th><th>Account</th><th>Date (UTC)</th><th>Version</th></tr></thead><tbody>${audit.events.map((e) => `<tr><td>${esc(e.action.replaceAll(".", " ").replaceAll("_", " "))}</td><td>${esc(e.actor)}</td><td>${esc(e.at)}</td><td>${e.version || "—"}</td></tr>`).join("")}</tbody></table></div><details><summary>Change password</summary><form id="password-form"><label>Current password<input name="current" type="password" autocomplete="current-password" required></label><label>New password<input name="password" type="password" autocomplete="new-password" minlength="12" required></label><button>Change password</button></form></details><button id="sign-out">Sign out</button>`;
    root.append(dialog);
    dialog.showModal();
    dialog
      .querySelector(".dialog-close")!
      .addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove());
    const status = (message: string) => {
      dialog.querySelector("#team-status")!.textContent = message;
    };
    const run = async (fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (error) {
        status(String(error instanceof Error ? error.message : error));
      }
    };
    const download = (value: unknown, name: string) => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    dialog.querySelectorAll<HTMLButtonElement>("[data-remove-member]").forEach(
      (b) =>
        (b.onclick = () =>
          void run(async () => {
            if (!confirm("Remove this colleague from the workspace?")) return;
            await this.request(
              `workspaces/${org.id}/members/${b.dataset.removeMember}/`,
              "POST",
              { role: "remove" },
            );
            b.closest("tr")?.remove();
            status("Workspace access removed.");
          })),
    );
    dialog
      .querySelector("#save-private")!
      .addEventListener("click", () =>
        download(project, "wildscape-private-edits.json"),
      );
    dialog.querySelector("#retry-save")?.addEventListener("click", () => {
      this.failed = false;
      this.save(this.lastProjects);
      status("Retrying save; close this panel to see save status.");
    });
    dialog.querySelector("#reload-server")?.addEventListener("click", () => {
      if (
        confirm(
          "Reload the server version? Unsaved edits will be lost. Download a private copy first.",
        )
      ) {
        this.failed = false;
        location.reload();
      }
    });
    dialog
      .querySelector("#switch-workspace")!
      .addEventListener("change", (event) => {
        if (this.failed || this.pending) {
          status("Resolve unsaved edits before switching workspaces.");
          return;
        }
        sessionStorage.setItem(
          "wildscape-workspace-id",
          (event.target as HTMLSelectElement).value,
        );
        location.reload();
      });
    dialog.querySelector("#sign-out")!.addEventListener(
      "click",
      () =>
        void run(async () => {
          await this.chain;
          if (this.failed)
            throw Error(
              "Download and resolve unsaved edits before signing out.",
            );
          await this.request("logout/", "POST", {});
          location.assign("/?workspace=1");
        }),
    );
    dialog
      .querySelector<HTMLFormElement>("#invite-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        void run(async () => {
          const data = new FormData(event.target as HTMLFormElement);
          const result = await this.request<{ invitationToken: string }>(
            `workspaces/${org.id}/invitations/`,
            "POST",
            { email: data.get("email"), role: data.get("role") },
          );
          const url = `${location.origin}/?workspace=1#invite=${encodeURIComponent(result.invitationToken)}`;
          dialog.querySelector("#invite-result")!.innerHTML =
            `<label>Private invitation link (expires in 72 hours)<input readonly value="${esc(url)}"></label><p>Share this link directly with the invited colleague.</p>`;
        });
      });
    dialog
      .querySelector<HTMLFormElement>("#password-form")!
      .addEventListener("submit", (event) => {
        event.preventDefault();
        void run(async () => {
          const form = event.target as HTMLFormElement;
          const data = new FormData(form);
          await this.request("password/", "POST", {
            current: data.get("current"),
            password: data.get("password"),
          });
          form.reset();
          status("Password changed. Other sessions will require sign-in.");
        });
      });
    dialog.querySelector("#archive-project")?.addEventListener(
      "click",
      () =>
        void run(async () => {
          await this.chain;
          if (this.failed)
            throw Error("Resolve unsaved edits before archiving.");
          if (
            !confirm(
              "Archive this project? Its evidence and revisions will remain available for restoration.",
            )
          )
            return;
          await this.request(
            `workspaces/${org.id}/projects/${project.id}/archive/`,
            "POST",
            { version: this.versions.get(project.id), archived: true },
          );
          location.reload();
        }),
    );
    dialog.querySelector("#list-archived")!.addEventListener(
      "click",
      () =>
        void run(async () => {
          const result = await this.request<{ projects: StoredProject[] }>(
            `workspaces/${org.id}/projects/?archived=true`,
          );
          const host = dialog.querySelector("#archived-list")!;
          host.innerHTML =
            result.projects
              .map(
                (p) =>
                  `<p>${esc(p.data.name)}${this.editable ? `<button data-restore="${esc(p.id)}">Restore project</button>` : ""}</p>`,
              )
              .join("") || "No archived projects.";
          host.querySelectorAll<HTMLButtonElement>("[data-restore]").forEach(
            (b) =>
              (b.onclick = () =>
                void run(async () => {
                  await this.chain;
                  if (this.failed)
                    throw Error("Resolve unsaved edits before restoring.");
                  const p = result.projects.find(
                    (p) => p.id === b.dataset.restore,
                  )!;
                  await this.request(
                    `workspaces/${org.id}/projects/${p.id}/archive/`,
                    "POST",
                    { version: p.version, archived: false },
                  );
                  location.reload();
                })),
          );
        }),
    );
    dialog.querySelector("#load-revisions")!.addEventListener(
      "click",
      () =>
        void run(async () => {
          const result = await this.request<{
            revisions: {
              version: number;
              actor: string;
              createdAt: string;
              data: Project;
            }[];
          }>(`workspaces/${org.id}/projects/${project.id}/revisions/`);
          const host = dialog.querySelector("#revision-list")!;
          host.innerHTML = result.revisions
            .map(
              (r) =>
                `<p>Version ${r.version} · ${esc(r.actor)} · ${esc(r.createdAt)} <button data-version="${r.version}">Download private revision</button></p>`,
            )
            .join("");
          host
            .querySelectorAll<HTMLButtonElement>("button")
            .forEach(
              (b) =>
                (b.onclick = () =>
                  download(
                    result.revisions.find(
                      (r) => r.version === Number(b.dataset.version),
                    )!.data,
                    `wildscape-private-v${b.dataset.version}.json`,
                  )),
            );
        }),
    );
  }
}
