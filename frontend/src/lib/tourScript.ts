import { GridVariable } from '../App';

export interface TourBeat {
  id: number;
  badge: string;
  title: string;
  targetDate: string; // ISO date substring to match timeSteps (YYYY-MM-DD)
  depthMeters: number;
  variable: GridVariable;
  camera: {
    destination: {
      lon: number;
      lat: number;
      height: number;
    };
    headingDeg: number;
    pitchDeg: number;
    rollDeg: number;
  };
  caption: string;
  scienceNote: string;
  instrumentId?: string;
  callToAction?: {
    label: string;
    action: 'open_3d' | 'open_profile';
  };
}

export const TOUR_BEATS: TourBeat[] = [
  {
    id: 1,
    badge: 'Pre-Storm Conditions',
    title: 'The Warm Pool Incubator',
    targetDate: '2020-05-14',
    depthMeters: 0.494, // Surface layer
    variable: 'temperature',
    camera: {
      destination: { lon: 87.5, lat: 13.5, height: 1850000 },
      headingDeg: 0,
      pitchDeg: -80,
      rollDeg: 0,
    },
    caption:
      'Before Cyclone Amphan emerged, broad swaths of the southern and central Bay of Bengal reached sea surface temperatures well above 30°C. Tropical cyclones require warm ocean water—typically at least 26.5°C—as their primary fuel source; this extensive warm pool provided ideal precursor conditions for storm development.',
    scienceNote:
      'Scientific Context: The tropical cyclone had not formed yet on May 14 (the depression formed on May 16). The GLORYS12 reanalysis shown here documents the massive reservoir of high ocean thermal energy (SST > 30.5°C) that later enabled rapid cyclone development.',
  },
  {
    id: 2,
    badge: 'Rapid Intensification',
    title: 'Super Cyclone at Peak Power',
    targetDate: '2020-05-18',
    depthMeters: 0.494,
    variable: 'temperature',
    camera: {
      destination: { lon: 86.8, lat: 16.5, height: 1100000 },
      headingDeg: 0,
      pitchDeg: -75,
      rollDeg: 0,
    },
    caption:
      'Feeding on the deep reservoir of heat, Cyclone Amphan rapidly intensified into a Category 5 Super Cyclonic Storm on May 18, generating sustained winds exceeding 240 km/h over the central Bay of Bengal.',
    scienceNote:
      'Scientific Context: Rapid intensification occurs when tropical cyclones pass over areas of high Ocean Heat Content with minimal vertical wind shear. Surface waters remained warm enough to sustain explosive convection as Amphan tracked northward.',
  },
  {
    id: 3,
    badge: 'Coastal Landfall',
    title: 'Landfall at the Sundarbans Delta',
    targetDate: '2020-05-20',
    depthMeters: 0.494,
    variable: 'temperature',
    camera: {
      destination: { lon: 88.6, lat: 21.8, height: 650000 },
      headingDeg: 0,
      pitchDeg: -70,
      rollDeg: 0,
    },
    caption:
      'On May 20, Amphan struck the low-lying coast near the Sundarbans mangrove forest, generating devastating storm surges and torrential rainfall across coastal West Bengal and Bangladesh.',
    scienceNote:
      'Scientific Context: As the cyclone approached the shallow continental shelf, fierce cyclonic winds piled vast volumes of water onshore. Friction with land and atmospheric interaction rapidly deteriorated the storm circulation following landfall.',
  },
  {
    id: 4,
    badge: 'Documented Cold Wake',
    title: "The Ocean's Cold Wake",
    targetDate: '2020-05-21',
    depthMeters: 0.494,
    variable: 'temperature',
    camera: {
      destination: { lon: 87.0, lat: 16.2, height: 950000 },
      headingDeg: 0,
      pitchDeg: -75,
      rollDeg: 0,
    },
    caption:
      "In the wake of Amphan's passage, vigorous wind-driven cyclonic suction dredged cold, deep ocean water to the surface, cooling the sea by 2–4°C along its track. This published phenomenon cooled the ocean so much that it choked off the storm's own heat source—a documented negative feedback loop.",
    scienceNote:
      'Scientific Context: Cyclonic wind stress causes strong Ekman divergence and shear-induced vertical mixing, drawing thermocline water upward. This linear cold wake is clearly visible in the satellite-assimilated reanalysis.',
    callToAction: {
      label: '🌊 Drill into 3D Volumetric View',
      action: 'open_3d',
    },
  },
  {
    id: 5,
    badge: 'Ecological Aftermath',
    title: 'Phytoplankton & In-Situ Evidence',
    targetDate: '2020-05-24',
    depthMeters: 0.494,
    variable: 'temperature',
    camera: {
      destination: { lon: 90.16, lat: 12.73, height: 700000 },
      headingDeg: 0,
      pitchDeg: -70,
      rollDeg: 0,
    },
    instrumentId: '2902264',
    caption:
      'When cyclones dredge cold water to the surface, they also transport deep nutrients that can trigger blooms of phytoplankton (tiny ocean plants). While this app does not include gridded chlorophyll satellite maps, in-situ BGC-Argo float #2902264 recorded real post-storm subsurface chlorophyll-a profiles directly in the Bay.',
    scienceNote:
      'Data vs Science Distinction: The general concept of post-cyclone biological blooms is well-established marine science, but this demo platform does NOT claim to show a gridded surface bloom (no gridded chlorophyll exists in this reanalysis layer). Instead, click highlighted BGC-Argo float #2902264 on the map to inspect its real, measured chlorophyll depth profile taken on May 24.',
    callToAction: {
      label: '📊 View Float #2902264 Chlorophyll Profile',
      action: 'open_profile',
    },
  },
];
