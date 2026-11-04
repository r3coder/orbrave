// When the orb page uses its phone layout (orbsMobile.js / orbsMobile.css), shared by orbs.js and
// orbsMobile.js. orbsMobile.css repeats the same query: keep the two in step.
//
// Narrow screens, and near-square ones up to 900px wide: unfolded foldables (Galaxy Z Fold about
// 690×830 / 830×690, Pixel 9 Pro Fold about 820×790, Pixel Fold about 840×700) are phones too.
export const PHONE_QUERY =
  '(max-width: 760px), (max-width: 900px) and (max-height: 1000px) and (min-aspect-ratio: 3/4) and (max-aspect-ratio: 4/3)';
export const isPhone = matchMedia(PHONE_QUERY);
