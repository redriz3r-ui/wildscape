const root = document.querySelector<HTMLElement>("#app");
if (root && new URLSearchParams(location.search).get("planner") === "mojave") {
  void import("./planner/MojavePlanner").then(({MojavePlanner})=>new MojavePlanner(root).start());
} else if (root) {
  if (
    import.meta.env.VITE_REQUIRE_ACCOUNT !== "true" &&
    new URLSearchParams(location.search).has("explore")
  ) {
    void import("./style.css");
    void import("./app/App").then(({ App }) => new App(root).start());
  } else {
    void import("./screening/ScreeningApp").then(({ ScreeningApp }) =>
      new ScreeningApp(root).start(),
    );
  }
}
