import type contrib from "blessed-contrib";
import type { ProjectStats } from "../../types.js";

export function updateProjectsPanel(
  bar: contrib.Widgets.BarElement,
  projects: ProjectStats[]
): void {
  const top = projects.slice(0, 6);

  if (top.length === 0) {
    bar.setData({
      titles: ["No data"],
      data: [0],
    });
    return;
  }

  bar.setData({
    titles: top.map((p) =>
      p.projectName.length > 8
        ? p.projectName.slice(0, 7) + ".."
        : p.projectName
    ),
    data: top.map((p) => p.sessionCount),
  });
}
