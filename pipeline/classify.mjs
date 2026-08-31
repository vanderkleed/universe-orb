// Keyword classifier: assigns a public dataset slug to a galaxy (domain).
// Order matters: the first matching domain wins. Unmatched slugs go to "Uncharted"
// (rendered as the interstellar field). Curated overrides live in pipeline/curated.json.

export const DOMAINS = [
  ["Microscopy", /microscop|cell|cells|blood|bacteria|colony|colonies|petri|parasite|sperm|pollen|algae|plankton|chromosome|nuclei|nucleus|malaria/],
  ["Medical", /tumor|tumour|cancer|brain|medical|dental|tooth|teeth|skin|xray|x-ray|ct-scan|mri|lung|bone|fracture|wound|surgery|surgical|retina|eye-disease|patient|ultrasound|polyp|kidney|dermat|melanoma|pneumonia|covid|medic|anatomy|organ|spine|liver|heart|ecg|clinical|hospital|pill|tablet|medicine|drug/],
  ["Fire", /fire|smoke|flame|wildfire|burn/],
  ["Security", /weapon|gun|guns|knife|knives|pistol|rifle|cctv|intru|surveillance|license|licence|plate|plates|alpr|anpr|violence|fight|theft|thief|crime|suspicious|security|camera-trap/],
  ["Safety", /helmet|ppe|hardhat|hard-hat|vest|safety|fall|construction|worker|workers|glove|goggle|mask|masks/],
  ["Waste", /waste|trash|garbage|litter|recycl|plastic|bottle|bottles|cans|e-waste|rubbish|dump/],
  ["Insects", /insect|insects|bee|bees|butterfly|butterflies|mosquito|-ants?-|pest|pests|-bugs?-|spider|beetle|larva|wasp|moth|flies|cockroach|dragonfly|locust|aphid/],
  ["Marine", /fish|fishes|underwater|marine|coral|reef|shark|whale|dolphin|jellyfish|-sea-|ocean|aqua|shrimp|crab|lobster|diver|boat|boats|ship|ships|vessel|turtle/],
  ["Agriculture", /crop|crops|leaf|leaves|plant|plants|weed|weeds|fruit|fruits|tomato|apple|apples|rice|wheat|corn|maize|cotton|soy|grape|grapes|strawberr|banana|mango|orange|oranges|palm|coffee|cocoa|cattle|cow|cows|sheep|pig|pigs|chicken|poultry|livestock|farm|agri|harvest|seed|seeds|flower|flowers|tree|trees|paddy|potato|onion|pepper|chili|cucumber|lettuce|cabbage|durian|olive|citrus|lemon|coconut|sugarcane|-tea-|greenhouse|garden|forest|wood|timber|lumber/],
  ["Aerial", /drone|drones|uav|aerial|satellite|sentinel|orthophoto|rooftop|roof|roofs|landsat|aircraft|airplane|plane|planes|helicopter|airport|runway/],
  ["Mobility", /-car-|cars|vehicle|vehicles|traffic|road|roads|pothole|potholes|lane|lanes|pedestrian|crosswalk|parking|truck|trucks|-bus-|motorcycle|motorbike|bike|bikes|bicycle|sign|signs|speed|highway|autonomous|driving|dashcam|tram|train|railway|rail|tire|tyre|wheel|number-plate|accident|crash|scooter|-ev-|charging/],
  ["Wildlife", /animal|animals|wildlife|bird|birds|dog|dogs|-cat-|cats|deer|elephant|tiger|lion|monkey|zebra|giraffe|bear|wolf|fox|snake|horse|horses|pet|pets|rabbit|squirrel|penguin|owl|eagle|goat|duck|rat|mouse|mice|leopard|panda|kangaroo|hen|frog|lizard/],
  ["Retail", /retail|shelf|shelves|product|products|grocery|supermarket|store|shop|checkout|sku|cola|coke|snack|beverage|drink|drinks|price|cart|logo|logos|brand|brands|package|packaging|barcode|qr|inventory|warehouse|pallet|parcel|delivery|milk|cereal|coca|pepsi|nestle|unilever/],
  ["Sports", /football|soccer|basketball|tennis|ball|balls|player|players|sport|sports|golf|cricket|baseball|volleyball|hockey|badminton|court|goal|goalkeeper|referee|billiard|snooker|squash|bowling|rugby|swim|swimming|gym|yoga|exercise|workout|fitness|athlete|jersey|climbing|skate|ski|surf|race|racing|f1|karting|archery|dart|darts|-pool-|padel|pickleball/],
  ["Food", /food|foods|dish|dishes|meal|meals|pizza|burger|vegetable|vegetables|bread|cake|sushi|noodle|calorie|nutrition|restaurant|kitchen|cook|cooking|egg|eggs|cup|cups|bowl|spoon|fork|cutlery|dessert|fries|sandwich|donut|cookie|candy|chocolate|menu|recipe|ingredient|meat|beef|steak|fried|nasi|kimchi|dim-sum/],
  ["Gesture", /hand|hands|gesture|gestures|sign-language|asl|finger|fingers|pose|poses|face|faces|facial|emotion|emotions|expression|eye|eyes|gaze|drows|yawn|smile|person|people|human|humans|body|skeleton|fall-detection|keypoint|keypoints|action|activity|activities|gait|posture|head|attendance/],
  ["Industrial", /defect|defects|crack|cracks|weld|welding|pcb|solar|panel|panels|conveyor|machine|machinery|factory|manufactur|steel|metal|surface|bolt|bolts|nut|nuts|gear|screw|screws|pipe|pipes|valve|gauge|meter|bearing|casting|wafer|fabric|textile|box|boxes|cable|wire|wires|circuit|chip|component|components|tool|tools|robot|robotic|arm|industrial|inspection|quality|corrosion|rust|leak|tank|transformer|insulator|pole|power-line|battery|motor|engine|brick|concrete|cement|wall|tile|tiles|door|window|furniture|chair|table|lamp/],
  ["Games", /game|games|chess|poker|card|cards|dice|puzzle|minecraft|valorant|csgo|cs2|cs-go|fortnite|pubg|apex|league|dota|roblox|gta|pokemon|mario|screen|-ui-|button|buttons|-bot-|aim|aimbot|rubik|lego|toy|toys|sudoku|tetris|arena|enemy|enemies|zombie|character|characters|anime|cartoon|comic|manga|osu|genshin|overwatch|halo|-cod-|warzone|dbd|tarkov|albion|among-us|fifa|nba2k|rocket-league/],
];

export const DOMAIN_NAMES = DOMAINS.map(d => d[0]);

export function projectPart(slug) {
  return (slug.split("/")[1] || slug).replace(/-[a-z0-9]{5}$/, "");
}

export function classify(slug, overrides = {}) {
  if (overrides[slug]) return overrides[slug];
  const s = "-" + projectPart(slug).toLowerCase() + "-";
  for (const [dom, re] of DOMAINS) if (re.test(s)) return dom;
  return "Uncharted";
}
