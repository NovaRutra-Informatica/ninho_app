using System.Globalization;

namespace Ninho.Core;

public sealed record CoachInsight(string Id, string Title, string Message, string Evidence, string Route, string Action);
public sealed record CoachEstimate(double Mean, double Lower, double Upper, int Samples);

/// <summary>A Beta(1,1) prior is updated by observed study days. Navigation is never a study outcome.</summary>
public static class AdaptiveCoach
{
    public static CoachEstimate Estimate(int successes, int samples)
    {
        if (samples < 0 || successes < 0 || successes > samples) throw new ArgumentOutOfRangeException(nameof(successes));
        var a = successes + 1d; var b = samples - successes + 1d;
        var mean = a / (a + b);
        var spread = 1.96 * Math.Sqrt(a * b / (Math.Pow(a + b, 2) * (a + b + 1)));
        return new(mean, Math.Max(0, mean - spread), Math.Min(1, mean + spread), samples);
    }

    public static IReadOnlyList<CoachInsight> Analyze(StudyState state, DateTimeOffset now, CoachJournal? usage = null)
    {
        var result = new List<CoachInsight>();
        var profile = state.Profile;
        var today = DateOnly.FromDateTime(now.LocalDateTime);
        var sessions = state.Sessions.Where(s => s.DurationMinutes > 0 && s.Kind != "break" && s.CompletedAt <= now && s.CompletedAt >= now.AddDays(-90)).ToArray();
        var studiedToday = sessions.Where(s => DateOnly.FromDateTime(s.CompletedAt.LocalDateTime) == today).Sum(s => s.DurationMinutes);
        var daily = profile?.DailyMinutes ?? state.Settings.DailyMinutes;
        var block = Math.Min(profile?.SessionMinutes ?? state.Settings.FocusMinutes, daily);
        var due = StudyEngine.DueCards(state, now).ToArray();
        if (due.Length > 0)
            result.Add(new("review", "Vamos dar uma volta no que você aprendeu?", $"Há {due.Length} cartão(ões) disponíveis para revisar. Um bloco de até {Math.Min(10, block)} minutos já é um próximo passo.", "Agenda de revisão e limite diário de novos cartões.", "reviews", "Revisar agora"));
        var attempts = state.Attempts.Where(a => a.At <= now && a.At >= now.AddDays(-30)).ToArray();
        var difficult = attempts.GroupBy(a => a.SubjectId).Select(g => new { Id = g.Key, N = g.Count(), Hard = g.Count(a => a.Rating is "again" or "hard") })
            .Where(g => g.N >= 5 && g.Hard >= 3).OrderByDescending(g => (g.Hard + 1d) / (g.N + 2d)).FirstOrDefault();
        if (difficult != null)
        {
            var name = state.Subjects.FirstOrDefault(s => s.Id == difficult.Id)?.Name ?? "uma matéria";
            result.Add(new("difficulty", $"Que tal retomar um exemplo de {name}?", "Releia uma explicação curta e tente lembrar com suas palavras antes de avançar.", $"Você marcou dificuldade em {difficult.Hard} de {difficult.N} revisões nos últimos 30 dias. Autoavaliação não é uma nota de domínio.", "reviews", "Abrir revisões"));
        }
        var recent = sessions.Where(s => s.CompletedAt >= now.AddDays(-28)).ToArray();
        var days = recent.Select(s => DateOnly.FromDateTime(s.CompletedAt.LocalDateTime)).Distinct().ToArray();
        // Completion timestamps are known; paused sessions do not provide a reliable starting hour.
        var period = recent.GroupBy(s => s.CompletedAt.LocalDateTime.Hour / 6).OrderByDescending(g => g.Count()).FirstOrDefault();
        if (recent.Length >= 6 && days.Length >= 4 && period != null && period.Count() >= 4 && period.Count() >= recent.Length * .5)
        {
            string[] names = ["madrugada", "manhã", "tarde", "noite"];
            result.Add(new("rhythm", $"Seus registros aparecem mais à {names[period.Key]}.", "Esse pode ser um horário para experimentar seu próximo bloco, se combinar com a rotina do perfil.", $"{period.Count()} de {recent.Length} sessões terminaram nesse período, em {days.Length} dias. Isso não mede seu melhor rendimento nem o horário exato de início.", "profile", "Ajustar minha rotina"));
        }
        if (recent.Length >= 6 && days.Length >= 4)
        {
            var first = days.Min(); var eligible = Enumerable.Range(0, today.DayNumber - first.DayNumber + 1).Select(first.AddDays)
                .Where(d => d < today && (profile?.AvailableDays.Count is not > 0 || profile.AvailableDays.Contains(DayKey(d.DayOfWeek)))).ToArray();
            if (eligible.Length >= 7)
            {
                var active = eligible.Count(d => days.Contains(d)); var estimate = Estimate(active, eligible.Length);
                result.Add(new("consistency", "Vamos manter um plano que caiba na sua semana.", $"Sua frequência recente sugere cerca de {estimate.Mean:P0} de chance de haver um registro em um dia disponível semelhante. É uma estimativa ampla, não uma previsão de desempenho.", $"Estudo registrado em {active} de {eligible.Length} dias disponíveis observados. Faixa aproximada: {estimate.Lower:P0}–{estimate.Upper:P0}. Dias sem registro podem incluir estudo fora do Ninho.", "profile", "Rever meus horários"));
            }
        }
        if (sessions.Length > 0 && (now - sessions.Max(s => s.CompletedAt)).TotalDays >= 3)
            result.Add(new("return", "Um recomeço pequeno também conta.", $"Se fizer sentido hoje, reserve {Math.Min(10, block)} minutos para retomar uma aula. Você não precisa compensar tudo de uma vez.", $"O último estudo registrado aqui foi em {sessions.Max(s => s.CompletedAt).ToLocalTime():dd/MM}. Não sabemos o que você estudou fora do aplicativo.", "timer", "Abrir meu foco"));
        if (studiedToday >= daily)
            result.Add(new("goal", "Você alcançou o tempo que planejou para hoje.", "Vale fazer uma pausa e guardar uma nota do que funcionou. Amanhã seguimos do seu ponto de partida.", $"{Math.Floor(studiedToday)} minutos registrados para uma meta de {daily}. Tempo registrado não comprova aprendizagem.", "progress", "Ver meu progresso"));
        if (usage is { Enabled: true })
        {
            var routes = usage.Days.Where(d => d.Date >= today.AddDays(-14) && d.Date <= today).SelectMany(d => d.Routes).GroupBy(r => r.Route)
                .Select(g => new { Route = g.Key, Visits = g.Sum(x => x.Visits), Seconds = g.Sum(x => x.ActiveSeconds) }).OrderByDescending(x => x.Visits).ToArray();
            if (routes.Sum(r => r.Visits) >= 10 && routes.Length >= 2)
            {
                var most = routes[0];
                var name = RouteName(most.Route);
                result.Add(new("usage", $"Você tem passado mais vezes por {name}.", "Posso usar esse contexto para deixar o próximo passo por perto. Navegar e estudar são coisas diferentes; seu tempo de estudo continua vindo das sessões salvas.", $"{most.Visits} visitas e {Math.Round(most.Seconds / 60d)} minutos com essa tela em primeiro plano, nos últimos 14 dias. Só observamos telas do Ninho.", most.Route, "Abrir " + name));
            }
            var pauses = usage.Days.Where(d => d.Date >= today.AddDays(-14) && d.Date <= today).Sum(d => d.Pauses);
            if (pauses >= 5)
                result.Add(new("pauses", "Seu bloco pode ser menor, se ajudar.", $"Você pode experimentar {Math.Max(1, Math.Min(15, block / 2))} minutos e ajustar depois. Pausar faz parte; não sabemos o motivo de cada pausa.", $"O botão de pausa foi usado {pauses} vezes nos últimos 14 dias. Sair do app não é contado como interrupção.", "profile", "Ajustar meu bloco"));
        }
        if (result.Count == 0 || sessions.Length == 0)
            result.Add(new("starting", sessions.Length == 0 ? "Vamos descobrir seu ritmo aos poucos." : "Seu próximo passo pode ser simples.", $"Comece com um bloco de até {block} minutos. Vou observar sessões e revisões registradas para trazer sugestões com mais contexto.", profile?.Goal is { Length: > 0 } goal ? "Seu objetivo: " + goal : "Ainda faltam registros suficientes para reconhecer uma rotina.", "timer", "Começar um foco"));
        return result.Take(7).ToArray();
    }

    public static string InitialPlan(StudentProfile profile)
    {
        var block = Math.Min(profile.DailyMinutes, profile.SessionMinutes);
        var days = profile.AvailableDays.Count == 0 ? "nos dias que você escolher" : string.Join(", ", profile.AvailableDays.Select(x => x switch { "mon" => "segunda", "tue" => "terça", "wed" => "quarta", "thu" => "quinta", "fri" => "sexta", "sat" => "sábado", _ => "domingo" }));
        return $"Seu objetivo: {(string.IsNullOrWhiteSpace(profile.Goal) ? "definir uma direção para os estudos" : profile.Goal)}\n\n" +
            $"1. Reserve até {profile.DailyMinutes} minutos {days}{(profile.PreferredTime.Length > 0 ? ", no horário que você descreveu: " + profile.PreferredTime : "")}. Esse total inclui as pausas.\n\n" +
            $"2. Comece com um bloco de até {block} minutos. Se ainda houver tempo disponível, divida o restante entre uma pausa e uma pequena revisão; não precisa preencher toda a meta.\n\n" +
            "3. Registre como foi e pratique lembrar uma ideia sem consultar. As próximas sugestões usarão esses registros; suas preferências continuam guardadas no perfil.\n\n" +
            "Proposta inicial do motor de análise incluído no Ninho. Ainda não há dados suficientes para prever sua rotina; ajuste o plano ao que funcionar para você.";
    }

    public static string DayKey(DayOfWeek day) => day switch { DayOfWeek.Monday => "mon", DayOfWeek.Tuesday => "tue", DayOfWeek.Wednesday => "wed", DayOfWeek.Thursday => "thu", DayOfWeek.Friday => "fri", DayOfWeek.Saturday => "sat", _ => "sun" };
    public static string RouteName(string route) => route switch { "today" => "Hoje", "studies" => "Meus estudos", "reviews" => "Revisões", "materials" => "Materiais", "agenda" => "Agenda", "progress" => "Progresso", "mentor" => "Minha assistente", "timer" => "Hora de focar", "profile" => "Meu perfil", _ => "Ajustes" };
}
