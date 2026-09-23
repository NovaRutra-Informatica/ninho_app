namespace Ninho.Core;

public static class WelcomeJourney
{
    public const int QuestionCount = 10;
    public static bool CanContinue(int step, StudentProfile profile) => step switch
    {
        1 => !string.IsNullOrWhiteSpace(profile.Name),
        2 => !string.IsNullOrWhiteSpace(profile.Goal),
        8 => profile.DailyMinutes is >= 1 and <= 1440 && profile.SessionMinutes is >= 1 and <= 240,
        _ => step is >= 0 and <= QuestionCount
    };
    public static int Resume(int savedStep, StudentProfile profile)
    {
        var step = Math.Clamp(savedStep, 0, QuestionCount + 1);
        if (step > 1 && !CanContinue(1, profile)) return 1;
        if (step > 2 && !CanContinue(2, profile)) return 2;
        return step;
    }
}
