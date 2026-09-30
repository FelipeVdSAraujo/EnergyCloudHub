# Energy Cloud Hub (EnSolveCloud)

**An open-source cloud platform for configuring, launching, and inspecting runs of energy-system models directly from a browser.**

This repository contains the source code of the **Energy Cloud Hub** (internally named *EnSolveCloud*) — the open, cloud-based web platform of the European project [iDesignRES](https://idesignres.eu/). The platform allows authenticated users to configure, launch, and inspect runs of the iDesignRES energy-system models — **OpenEMPIRE**, **EMX (North Sea Case)**, **TransComp Model**, and **GCAM** — directly from a browser, without needing advanced software skills or high-end hardware. It bridges the [IIASA](https://iiasa.ac.at/) Scenario Explorer open-database infrastructure with external stakeholders, and is deployed as a public, open-access service following the FAIR principles.

This platform is released as **Deliverable D4.2 / PR2** of Work Package 4 (Task 4.2) of iDesignRES, and satisfies **Milestone MS8** ("Cloud hub platform running").

**Live service:** https://ok-energycloudhub.it.ntnu.no/

## What the platform does

- **User accounts with supervised access** — self-registration with two-step email verification and admin approval, JWT-based authentication.
- **Model configuration from the browser** — select a model, adjust inputs and configuration through a guided UI.
- **Run orchestration** — submit model runs with one click; the platform dispatches them to the compute backend (SSH-orchestrated remote runners) and tracks their status.
- **Results access** — inspect and download run results once execution completes.
- **Open by design** — the platform is open source and connects to the open scenario-database infrastructure, enabling reuse and scrutiny of modelling results.

## Architecture

| Component | Technology | Role |
|---|---|---|
| `client/` | React + Tailwind CSS | Frontend: model configuration, run dashboards, results viewing, account management |
| `server/` | Node.js, Express, MongoDB, Nodemailer, Multer | REST API: authentication and approval workflow, run management, file uploads, remote run orchestration over SSH |
| `docker-compose.yml` | Docker Compose (+ Mailpit) | Self-contained development stack |
| `docker-compose.production.yml` | Docker Compose | Production deployment (API, client, MongoDB) |

The energy-system models themselves (OpenEMPIRE, EMX, TransComp, GCAM) are maintained in separate repositories and are orchestrated by this platform; this repository contains the platform code only. The open-source [OpenEMPIRE model](https://github.com/ntnuiotenergy/OpenEMPIRE) is available from NTNU under the MIT license.

## Quick start (development)

```bash
# 1. Configure the API environment
cp server/.env.production.example server/.env   # adjust values as needed

# 2. Build and start the development stack (API, MongoDB, Mailpit)
docker compose up --build

# 3. Frontend dev server
cd client && npm install && npm start
```

API default port: `4000` · Frontend dev server: `3000` · Mailpit web UI: `8025`.

For production, copy `server/.env.production.example` to `server/.env.production`, adjust it, and run `docker compose -f docker-compose.production.yml up -d --build`.

## License

Copyright (c) 2025–2026 Norwegian University of Science and Technology (NTNU), with contributions from Felipe van de Sande Araujo and Martti Harma.

This project is licensed under the **European Union Public Licence v. 1.2 (EUPL-1.2)** — see [LICENSE](./LICENSE). Third-party components retain their own licenses; see [NOTICE.md](./NOTICE.md) for attributions.

## Funding

This project has received funding from the European Union's Horizon Europe research and innovation programme under grant agreement No. 101095849 (**iDesignRES**).

> Views and opinions expressed are however those of the author(s) only and do not necessarily reflect those of the European Union or CINEA. Neither the European Union nor the granting authority can be held responsible for them.

## Credits

Developed at the [Norwegian University of Science and Technology (NTNU)](https://www.ntnu.no/) by **Felipe van de Sande Araujo** and **Martti Harma**, within the iDesignRES project. See [NOTICE.md](./NOTICE.md) for further acknowledgements.
