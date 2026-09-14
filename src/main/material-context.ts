import path from "node:path";
import type { AppState } from "../shared/types";

export function inferMaterialContext(
  state: AppState,
  filename: string,
  context: { subjectId?: string; lessonId?: string } = {},
) {
  const match = /^curso-(\d+)-aula-(\d+)(?:[-_.])/i.exec(
    path.basename(filename),
  );
  const course =
    match && path.extname(filename).toLowerCase() === ".pdf"
      ? state.courses.find(
          (course) =>
            course.id === match[1] &&
            /estratégia|estrategia/i.test(course.provider),
        )
      : undefined;
  const lesson =
    course && match
      ? state.lessons.find(
          (lesson) =>
            lesson.id === `${course.id}:aula:${match[2].padStart(2, "0")}` &&
            lesson.courseId === course.id,
        )
      : undefined;
  const subjectId = context.subjectId || course?.subjectId || "";
  return {
    subjectId,
    lessonId:
      context.lessonId ?? (lesson?.subjectId === subjectId ? lesson.id : ""),
  };
}
