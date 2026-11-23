export function getParamCap(season) {
  if (season < 10) return 1800;
  if (season < 16) return 2160;
  if (season < 25) return 2400;
  if (season < 37) return 2760;
  return 3360;
}

// From season 55 the whole bonus shrinks for each param below 900 × its
// criterion, by a fixed step plus the shortfall's share. Fitted from 37 contest
// formation panel readings (ver 3.5.0, 2026-11-04); seasons before 55 unchecked.
function getShortfallRate(params, criteria, season) {
  if (season < 55) return 1;
  let rate = 1;
  for (const key of Object.keys(criteria)) {
    const threshold = 900 * criteria[key];
    if (params[key] < threshold) {
      rate -= 0.0979 + 0.1512 * (1 - params[key] / threshold);
    }
  }
  return rate;
}

export function calculateTypeMultipliers(
  params,
  stage,
  supportBonus = 0,
  enterPercents = false,
) {
  const { type, criteria, season } = stage;

  if (type !== "contest" || enterPercents) {
    return {
      vocal: params.vocal / 100,
      dance: params.dance / 100,
      visual: params.visual / 100,
    };
  }

  const hasFlatBonus = season == 13;
  const hasFlatterBonus = season == 23;

  const multipliers = {};
  const shortfallRate = getShortfallRate(params, criteria, season);

  for (const key of Object.keys(criteria)) {
    const param = Math.min(params[key], getParamCap(season));
    const criterion = criteria[key];

    let multiplier = 0;
    if (season < 25) {
      if (param > 1200) {
        multiplier = param + 3000;
        if (hasFlatBonus) multiplier += param - 1200;
      } else if (param > 900) {
        multiplier = param * 2 + 1800;
      } else if (param > 600) {
        multiplier = param * 3 + 900;
      } else if (param > 300) {
        multiplier = param * 4 + 300;
      } else if (param > 0) {
        multiplier = param * 5;
      }
    } else if (season < 37) {
      if (param > 2500) {
        multiplier = param + 3000 + (param - 2500) * 0.2;
      } else if (param > 1800) {
        multiplier = param * 1.5 + 1800;
      } else if (param > 1200) {
        multiplier = param * 2 + 900;
      } else if (param > 600) {
        multiplier = param * 2.5 + 300;
      } else if (param > 300) {
        multiplier = param * 3;
      } else if (param > 0) {
        multiplier = param * 4 - 250;
      }
    } else if (season < 39) {
      if (param > 2800) {
        multiplier = param * 0.8525 + 3095;
      } else if (param > 2100) {
        multiplier = param * 1.275 + 1915;
      } else if (param > 1500) {
        multiplier = param * 1.7 + 1020;
      } else if (param > 900) {
        multiplier = param * 2.1225 + 387.5;
      } else if (param > 0) {
        multiplier = param * 2.55;
      }
    } else {
      if (param > 2800) {
        multiplier = param * 0.6 + 4300;
      } else if (param > 2100) {
        multiplier = param * 1 + 3180;
      } else if (param > 1500) {
        multiplier = param * 1.8 + 1500;
      } else if (param > 900) {
        multiplier = param * 2.5 + 450;
      } else if (param > 0) {
        multiplier = param * 3;
      }
    }

    if (hasFlatterBonus) multiplier += param;

    multiplier = multiplier * criterion * shortfallRate + 100;
    multiplier =
      Math.ceil(multiplier) *
      (1 + supportBonus + (hasFlatterBonus ? 0.01 : 0));
    multiplier = Math.ceil(Math.floor(multiplier * 10) / 10);

    multipliers[key] = multiplier / 100;
  }

  return multipliers;
}

// Idol Road stages turn params into their score bonus % with a curve per
// stage: permil read off a piecewise-linear line per type, then the whole
// bonus shrinks by 10% plus 15% of the shortfall for each param below the
// stage's threshold. Checked against 135 in-game readings (Idol Road stages
// 1–5, 27 memories each). Returns whole percents, or null when a param is
// outside the curve's readings, so the caller asks for the % instead.
const TYPES = ["vocal", "dance", "visual"];

function curvePermil(parameters, values, param) {
  if (!(param >= parameters[0]) || param > parameters[parameters.length - 1]) {
    return null;
  }
  for (let i = 1; i < parameters.length; i++) {
    if (param <= parameters[i]) {
      const [x0, x1] = [parameters[i - 1], parameters[i]];
      const [y0, y1] = [values[i - 1], values[i]];
      return Math.ceil(y0 + ((y1 - y0) * (param - x0)) / (x1 - x0));
    }
  }
  return null;
}

export function calculateIdolRoadPercents(params, scoreCurve) {
  if (!scoreCurve) return null;
  const { thresholds, parameters } = scoreCurve;
  let penalty = 0;
  for (const key of TYPES) {
    const param = params[key];
    if (param < thresholds[key]) {
      penalty += 100 + Math.floor(150 * (1 - param / thresholds[key]));
    }
  }
  const percents = {};
  for (const key of TYPES) {
    const permil = curvePermil(parameters, scoreCurve[key], params[key]);
    if (permil == null) return null;
    percents[key] =
      100 + Math.ceil(Math.floor((permil * (1000 - penalty)) / 1000) / 10);
  }
  return percents;
}
