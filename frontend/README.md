# /frontend

This directory contains the user interface built with React, Vite, TypeScript, and Tailwind CSS.

## Role
- Utilizes CesiumJS for 3D geospatial rendering of the Bay of Bengal, storm path, in-situ instrument markers, and gridded WMS ocean layer overlays.
- Utilizes Three.js for localized high-fidelity 3D volume or vector rendering (e.g., current fields, float profiles).
- Utilizes Plotly.js for analytical dashboards, cross-sections, and point instrument profile series.
- Connects directly to the FastAPI `/backend` for point instrument queries and `/tds` (THREDDS) for gridded WMS overlays.
