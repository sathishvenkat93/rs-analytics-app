/* Generated from world-atlas/countries-110m and us-atlas/states-10m names. */
export const COUNTRY_NAMES: string[] = ["Afghanistan","Albania","Algeria","Angola","Antarctica","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bangladesh","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herz.","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cambodia","Cameroon","Canada","Central African Rep.","Chad","Chile","China","Colombia","Congo","Costa Rica","Croatia","Cuba","Cyprus","Czechia","Côte d'Ivoire","Dem. Rep. Congo","Denmark","Djibouti","Dominican Rep.","Ecuador","Egypt","El Salvador","Eq. Guinea","Eritrea","Estonia","Ethiopia","Falkland Is.","Fiji","Finland","Fr. S. Antarctic Lands","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Greenland","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Lithuania","Luxembourg","Macedonia","Madagascar","Malawi","Malaysia","Mali","Mauritania","Mexico","Moldova","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","N. Cyprus","Namibia","Nepal","Netherlands","New Caledonia","New Zealand","Nicaragua","Niger","Nigeria","North Korea","Norway","Oman","Pakistan","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Puerto Rico","Qatar","Romania","Russia","Rwanda","S. Sudan","Saudi Arabia","Senegal","Serbia","Sierra Leone","Slovakia","Slovenia","Solomon Is.","Somalia","Somaliland","South Africa","South Korea","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States of America","Uruguay","Uzbekistan","Vanuatu","Venezuela","Vietnam","W. Sahara","Yemen","Zambia","Zimbabwe","eSwatini"];

export const US_STATE_NAMES: string[] = ["Alabama","Alaska","American Samoa","Arizona","Arkansas","California","Colorado","Commonwealth of the Northern Mariana Islands","Connecticut","Delaware","District of Columbia","Florida","Georgia","Guam","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Puerto Rico","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","United States Virgin Islands","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"];

/** Common spellings and codes that differ from the atlas names. */
export const COUNTRY_ALIASES: Record<string, string> = {
  usa: "United States of America", us: "United States of America", "united states": "United States of America", america: "United States of America",
  uk: "United Kingdom", gb: "United Kingdom", "great britain": "United Kingdom", england: "United Kingdom", britain: "United Kingdom",
  uae: "United Arab Emirates", "south korea": "South Korea", korea: "South Korea", "republic of korea": "South Korea", "north korea": "North Korea",
  russia: "Russia", "russian federation": "Russia", "czech republic": "Czechia", "ivory coast": "Côte d'Ivoire", "cote d'ivoire": "Côte d'Ivoire",
  "democratic republic of the congo": "Dem. Rep. Congo", drc: "Dem. Rep. Congo", "dr congo": "Dem. Rep. Congo", "republic of the congo": "Congo",
  "dominican republic": "Dominican Rep.", "central african republic": "Central African Rep.", "bosnia and herzegovina": "Bosnia and Herz.",
  "south sudan": "S. Sudan", "western sahara": "W. Sahara", "equatorial guinea": "Eq. Guinea", "solomon islands": "Solomon Is.",
  "falkland islands": "Falkland Is.", eswatini: "eSwatini", swaziland: "eSwatini", "north macedonia": "Macedonia", burma: "Myanmar",
  holland: "Netherlands", "the netherlands": "Netherlands", "viet nam": "Vietnam", "lao pdr": "Laos", "iran, islamic republic of": "Iran",
  "syrian arab republic": "Syria", "türkiye": "Turkey", turkiye: "Turkey", in: "India", ind: "India", cn: "China", chn: "China", jp: "Japan", jpn: "Japan",
  de: "Germany", deu: "Germany", fr: "France", fra: "France", ca: "Canada", can: "Canada", au: "Australia", aus: "Australia", br: "Brazil", bra: "Brazil",
  mx: "Mexico", mex: "Mexico", es: "Spain", esp: "Spain", it: "Italy", ita: "Italy", nl: "Netherlands", nld: "Netherlands", se: "Sweden", swe: "Sweden",
  sg: "Singapore", nz: "New Zealand", nzl: "New Zealand", za: "South Africa", zaf: "South Africa", ie: "Ireland", irl: "Ireland", ch: "Switzerland", che: "Switzerland",
};

export const US_STATE_ABBR: Record<string, string> = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",
  GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",
  MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",
  NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",
  SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",PR:"Puerto Rico",
};
