# Notices, Credits and Acknowledgements

## Copyright

Copyright (c) 2025–2026 Norwegian University of Science and Technology (NTNU), with
contributions from Felipe van de Sande Araujo and Martti Harma.

The Energy Cloud Hub (EnSolveCloud) platform code is licensed under the European Union
Public Licence v. 1.2 (EUPL-1.2) — see [LICENSE](./LICENSE).

## Project credits

The **Energy Cloud Hub** is Deliverable D4.2 / PR2 of Work Package 4 (Task 4.2) of the
[iDesignRES](https://idesignres.eu/) project, funded by the European Union under the
Horizon Europe research and innovation programme, grant agreement No. 101095849.

Developed by:

- **Felipe van de Sande Araujo** — NTNU
- **Martti Harma** — NTNU

## Acknowledgements

The platform hosts and orchestrates the iDesignRES energy-system models, which are
maintained as separate works:

- **OpenEMPIRE** (EMPIRE energy-system model) — NTNU IoT Energy Systems Group,
  [ntnuiotenergy/OpenEMPIRE](https://github.com/ntnuiotenergy/OpenEMPIRE), MIT license.
- **pypsa-fbmc** (flow-based market coupling research used by the Ukraine FBMC scenario) —
  Amel de Kok and Wouter Koks, MIT license. The Ukraine FBMC scenario presets adopt
  Wouter Koks' RMF pairing (N-1 0.1, N-0 5.0).
- **iDesignRES nomenclature / IAMC data-exchange workflow** —
  [iDesignRES project](https://idesignres.eu/), building on the Horizon 2020 projects
  openENTRANCE and ECEMF, CC-BY-4.0.
- **IIASA Scenario Explorer** — the open-database infrastructure (PR1) that this platform
  bridges with external stakeholders.

Frontend and backend build on the open-source Node.js, React, Express, MongoDB, and
Tailwind CSS ecosystems, and their dependency stacks (see `package.json` / package-lock
files in the root, `client/`, and `server/` for the full dependency inventory and their
licenses).
