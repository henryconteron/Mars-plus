// MARS+ EVA dose. Mirrors app/src/domain/radiation/dose.js — keep the two in parity.
// Surface exposure is walking time plus science tasks.
// Airlock time is spent inside the habitat (the unshielded surface rate does not apply).
// The reserve is unused margin on a nominal EVA, not time spent outside.
// AI-assisted (Claude). Reviewed by the MARS+ team.
using System;

public static class EvaDose
{
    public static double MinutesOutside(double travelMin, double workMin)
    {
        return travelMin + workMin;
    }

    public static double DoseUGy(double rateUGyPerHour, double minutesOutside)
    {
        return rateUGyPerHour * minutesOutside / 60.0;
    }
}
