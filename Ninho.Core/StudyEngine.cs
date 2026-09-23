using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Ninho.Core;

public sealed record Recommendation(string SubjectId, string Name, int Priority, string Reason, int Due, int Minutes, int Attempts, int Difficulties);
public sealed record ContextMessage(string Question, string Answer);

public static class StudyEngine
{
    public const int MaximumContextBytes = 10_000;
    private static readonly JsonSerializerOptions ContextJsonOptions = new(StudyStore.JsonOptions) { WriteIndented = false };

    public static IReadOnlyList<Recommendation> Recommend(StudyState state, DateTimeOffset now)
    {
        var sessions = state.Sessions.Where(x => x.CompletedAt <= now).GroupBy(x => x.SubjectId).ToDictionary(x => x.Key, x => x.ToArray());
        var cards = state.Cards.Where(x => !x.Suspended).GroupBy(x => x.SubjectId).ToDictionary(x => x.Key, x => x.ToArray());
        var attempts = state.Attempts.Where(x => x.At >= now.AddDays(-30) && x.At <= now).GroupBy(x => x.SubjectId).ToDictionary(x => x.Key, x => x.OrderByDescending(a => a.At).Take(30).ToArray());
        return state.Subjects.Select(subject =>
        {
            var history = sessions.GetValueOrDefault(subject.Id) ?? [];
            var deck = cards.GetValueOrDefault(subject.Id) ?? [];
            var answers = attempts.GetValueOrDefault(subject.Id) ?? [];
            var due = deck.Count(x => x.LastReviewedAt != null && x.DueAt <= now);
            var last = history.Select(x => (DateTimeOffset?)x.CompletedAt).Concat(deck.Where(x => x.LastReviewedAt <= now).Select(x => x.LastReviewedAt)).DefaultIfEmpty().Max();
            var gap = last is { } date ? Math.Max(0, (int)(now - date).TotalDays) : 0;
            var difficult = answers.Count(x => x.Rating is "again" or "hard");
            var flags = deck.Count(x => x.Flag != "none");
            var score = Math.Min(due * 4, 40) + Math.Min(gap, 21) + Math.Min(difficult * 5, 25) + Math.Min(flags * 3, 9);
            var exam = state.Exams.Where(x => x.SubjectId == subject.Id && !x.Completed)
                .Select(x => DateOnly.TryParse(x.Date, out var date) ? date.DayNumber - DateOnly.FromDateTime(now.LocalDateTime).DayNumber : int.MaxValue)
                .Where(x => x >= 0).DefaultIfEmpty(int.MaxValue).Min();
            if (exam <= 14) score += 20;
            var reasons = new List<string>();
            if (due > 0) reasons.Add($"{due} revisão(ões) vencida(s)");
            if (gap >= 3) reasons.Add($"{gap} dias desde a última prática registrada");
            if (difficult > 0) reasons.Add($"{difficult} resposta(s) difícil(eis) em {answers.Length} tentativa(s) recentes");
            if (flags > 0) reasons.Add($"{flags} cartão(ões) marcado(s) para conferir ou reaprender");
            if (exam <= 14) reasons.Add($"prova em {exam} dia(s)");
            if (reasons.Count == 0) reasons.Add(last == null ? "Comece com uma sessão curta; ainda faltam evidências." : "Continue a próxima aula e confira o que consegue lembrar.");
            return new Recommendation(subject.Id, subject.Name, Math.Min(100, score), string.Join(" • ", reasons), due, (int)Math.Round(history.Sum(x => x.DurationMinutes)), answers.Length, difficult);
        }).OrderByDescending(x => x.Priority).ThenBy(x => x.Name).ToArray();
    }

    public static IEnumerable<ReviewCard> DueCards(StudyState state, DateTimeOffset now, string? subjectId = null)
    {
        var today = DateOnly.FromDateTime(now.LocalDateTime);
        var introduced = state.Sessions.Count(x => x.Kind == "review" && x.Id.StartsWith("review:first:", StringComparison.Ordinal) && DateOnly.FromDateTime(x.CompletedAt.LocalDateTime) == today);
        var trackedIds = state.Sessions.Where(x => x.Id.StartsWith("review:first:", StringComparison.Ordinal)).Select(x => x.Id["review:first:".Length..]).ToHashSet();
        introduced += state.Cards.Count(x => !trackedIds.Contains(x.Id) && x.Repetitions == 1 && x.LastReviewedAt is { } reviewed && DateOnly.FromDateTime(reviewed.LocalDateTime) == today);
        var deck = state.Cards.Where(x => !x.Suspended && x.DueAt <= now && (string.IsNullOrEmpty(subjectId) || x.SubjectId == subjectId));
        return deck.Where(x => x.LastReviewedAt != null).OrderBy(x => x.DueAt).ThenByDescending(x => x.Lapses).ThenBy(x => x.Id)
            .Concat(deck.Where(x => x.LastReviewedAt == null).OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).Take(Math.Max(0, state.Settings.NewCardsPerDay - introduced)));
    }

    public static void Review(StudyState state, string cardId, string rating, DateTimeOffset now)
    {
        if (rating is not ("again" or "hard" or "good" or "easy")) throw new InvalidDataException("Avaliação inválida.");
        var card = state.Cards.Single(x => x.Id == cardId);
        if (card.LastReviewedAt == null)
            state.Sessions.Add(new StudySession { Id = "review:first:" + card.Id, SubjectId = card.SubjectId, Kind = "review", CompletedAt = now });
        switch (rating)
        {
            case "again": card.IntervalDays = 10.0 / 1440; card.Ease -= .2; card.Lapses++; card.Repetitions++; break;
            case "hard": card.IntervalDays = 1; card.Ease -= .15; card.Repetitions++; break;
            case "good": card.IntervalDays = card.IntervalDays < 1 ? 1 : Math.Max(1, Math.Round(card.IntervalDays * card.Ease, MidpointRounding.AwayFromZero)); card.Repetitions++; break;
            case "easy": card.IntervalDays = card.IntervalDays < 1 ? 4 : Math.Max(4, Math.Round(card.IntervalDays * card.Ease * 1.3, MidpointRounding.AwayFromZero)); card.Ease += .15; card.Repetitions++; break;
        }
        card.Ease = Math.Clamp(card.Ease, 1.3, 3.5);
        card.IntervalDays = Math.Min(card.IntervalDays, 36500);
        card.LastReviewedAt = now;
        // Match the existing scheduler: ten real minutes for relearning, otherwise local calendar days.
        card.DueAt = rating == "again" ? now.AddMinutes(10) : new DateTimeOffset(now.LocalDateTime.AddDays(card.IntervalDays));
        state.Attempts.Add(new QuestionAttempt { CardId = card.Id, SubjectId = card.SubjectId, Rating = rating, At = now });
    }

    public static void FinishFocus(StudyState state, DateTimeOffset now, string feedback)
    {
        var focus = state.Focus;
        var elapsed = focus.Elapsed(now);
        if (elapsed < 1) throw new InvalidDataException("Estude por pelo menos um segundo antes de salvar.");
        if (focus.IsBreak) { state.Focus = new FocusState { SubjectId = focus.SubjectId, LessonId = focus.LessonId, TargetMinutes = state.Settings.FocusMinutes }; return; }
        if (focus.SubjectId.Length > 0 && !state.Subjects.Any(x => x.Id == focus.SubjectId)) throw new InvalidDataException("Escolha uma matéria válida.");
        if (focus.LessonId.Length > 0 && !state.Lessons.Any(x => x.Id == focus.LessonId && x.SubjectId == focus.SubjectId)) throw new InvalidDataException("A aula não pertence à matéria escolhida.");
        if (!state.Sessions.Any(x => x.Id == focus.Id))
            state.Sessions.Add(new StudySession { Id = focus.Id, SubjectId = focus.SubjectId, LessonId = focus.LessonId, DurationMinutes = Math.Round(elapsed / 60, 3), CompletedAt = now, Feedback = feedback.Trim() });
        state.Focus = new FocusState { SubjectId = focus.SubjectId, LessonId = focus.LessonId, TargetMinutes = focus.Stopwatch ? focus.TargetMinutes : state.Settings.BreakMinutes, Stopwatch = focus.Stopwatch, IsBreak = !focus.Stopwatch };
    }

    public static string BuildContext(StudyState state, DateTimeOffset now, string? subjectId = null, IEnumerable<ContextMessage>? history = null)
    {
        subjectId = string.IsNullOrWhiteSpace(subjectId) ? null : subjectId;
        bool Scope(string id) => subjectId == null || id == subjectId;
        var names = state.Subjects.ToDictionary(x => x.Id, x => Clip(x.Name, 120));
        var context = new
        {
            today = now.ToString("yyyy-MM-dd"), student = Clip(state.Settings.Name, 100), dailyGoalMinutes = state.Settings.DailyMinutes, partial = true,
            scope = Clip(subjectId ?? "visão geral", 200),
            // Explicit fields only: never pass disk paths, generated plans, extension data or tutorial state.
            // This object is pinned: FitContextToBudget removes history/evidence, never profile answers.
            profile = state.Profile is not { } p ? null : new
            {
                p.Name, p.Goal, p.Motivation, p.TargetDate, p.Subjects, p.Level, p.Routine, p.AvailableDays,
                p.PreferredTime, p.DailyMinutes, p.SessionMinutes, p.Challenges, p.Preferences, p.Accessibility,
                p.Revision, p.UpdatedAt, selfReported = true
            },
            evidence = Recommend(state, now).Where(x => Scope(x.SubjectId)).Take(6)
                .Select(x => new { subjectId = Clip(x.SubjectId, 200), name = Clip(x.Name, 120), x.Priority, reason = Clip(x.Reason, 360), x.Due, x.Minutes, x.Attempts, x.Difficulties }),
            recentSessions = state.Sessions.Where(x => Scope(x.SubjectId) && x.DurationMinutes > 0 && x.CompletedAt <= now).OrderByDescending(x => x.CompletedAt).Take(8)
                .Select(x => new { subject = names.GetValueOrDefault(x.SubjectId, "Estudo livre"), x.DurationMinutes, x.CompletedAt, kind = Clip(x.Kind, 30), feedback = Clip(x.Feedback, 200) }),
            lessons = state.Lessons.Where(x => Scope(x.SubjectId) && (x.Status == "in-progress" || x.Notes.Length > 0)).OrderByDescending(x => x.UpdatedAt).Take(5)
                .Select(x => new { subject = names.GetValueOrDefault(x.SubjectId), title = Clip(x.Title, 120), status = Clip(x.Status, 30), notes = Clip(x.Notes, 350) }),
            questions = state.Cards.Where(x => Scope(x.SubjectId) && !x.Suspended && (x.LastReviewedAt == null || x.LastReviewedAt <= now))
                .OrderByDescending(x => x.Lapses).ThenBy(x => x.DueAt).Take(5)
                .Select(x => new { subject = names.GetValueOrDefault(x.SubjectId), question = Clip(x.Question, 200), answer = Clip(x.Answer, 250), source = Clip(x.Source, 100), flag = Clip(x.Flag, 30), x.Lapses, x.DueAt }),
            materials = state.Materials.Where(x => Scope(x.SubjectId)).OrderByDescending(x => x.CreatedAt).Take(3)
                .Select(x => new { subject = names.GetValueOrDefault(x.SubjectId, "Estudo livre"), name = Clip(x.Name, 120), type = Clip(x.Type, 20), x.Size, notes = Clip(x.Notes, 250), fullContentRead = false }),
            conversation = (history ?? []).TakeLast(2).Select(x => new { question = Clip(x.Question, 350), answer = Clip(x.Answer, 650), isStudyEvidence = false }),
            limits = "Resumo parcial com campos abreviados. Minutos, autoavaliações e conversa não comprovam domínio. Arquivos: somente metadados e notas; conteúdo integral não foi lido. Sem internet; fontes não verificadas."
        };
        return FitContextToBudget(JsonSerializer.Serialize(context, ContextJsonOptions), json => Encoding.UTF8.GetByteCount(json) <= MaximumContextBytes);
    }

    // Keep whole JSON records and the first recommendation. A caller can budget bytes or use its model's real tokenizer.
    // Conversation is discarded first: an earlier generated answer is never stronger evidence than study records.
    public static string FitContextToBudget(string contextJson, Func<string, bool> fits, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var context = JsonNode.Parse(contextJson) as JsonObject ?? throw new InvalidDataException("O contexto de estudos deve ser um objeto JSON.");
        if (context["evidence"] is not JsonArray || context["scope"] is not JsonValue || context["limits"] is not JsonValue)
            throw new InvalidDataException("O contexto de estudos está incompleto. Gere uma nova pergunta.");
        string Serialize() => context.ToJsonString(ContextJsonOptions);
        bool Fits(string value) { cancellationToken.ThrowIfCancellationRequested(); var accepted = fits(value); cancellationToken.ThrowIfCancellationRequested(); return accepted; }
        var result = Serialize();
        if (Fits(result)) return result;
        context["reducedForBudget"] = true;
        if (context["conversation"] is JsonArray conversation)
        {
            while (conversation.Count > 0)
            {
                conversation.RemoveAt(0);
                result = Serialize();
                if (Fits(result)) return result;
            }
        }
        string[] collections = ["materials", "lessons", "recentSessions", "questions", "evidence"];
        foreach (var minimum in new[] { 1, 0 })
        {
            var removed = true;
            while (removed)
            {
                removed = false;
                foreach (var name in collections)
                {
                    if (context[name] is not JsonArray items || items.Count <= (name == "evidence" ? 1 : minimum)) continue;
                    items.RemoveAt(items.Count - 1);
                    removed = true;
                    result = Serialize();
                    if (Fits(result)) return result;
                }
            }
        }
        throw new InvalidDataException("O perfil, a pergunta e as evidências mínimas excedem o contexto do modelo. O perfil foi preservado por inteiro. Encurte a pergunta ou use um modelo de instruções com contexto maior.");
    }

    private static string Clip(string value, int maximumBytes)
    {
        // Walk only the bounded prefix, without splitting a surrogate pair or allocating a copy of a large note.
        var length = 0;
        var bytes = 0;
        foreach (var rune in value.EnumerateRunes())
        {
            if (bytes + rune.Utf8SequenceLength > maximumBytes - 3) return value[..length] + "…";
            bytes += rune.Utf8SequenceLength;
            length += rune.Utf16SequenceLength;
        }
        return value;
    }
}
