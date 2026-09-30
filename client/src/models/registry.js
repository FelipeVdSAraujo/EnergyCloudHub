export const models = [
  {
    id: "empire",
    name: "OpenEMPIRE",
    description: "OpenEMPIRE is a free software for running capacity expansion planning with python. The model is a stochastic linear programming model used to analyze developments of the European power market. It has been used to analyze decarbonization of the European power system focusing on the supply side of the power market. \n\nThe purpose of the model is to support long-term capacity expansion of the power system under short-term operational uncertainty with a special focus of representing variable renewable energy sources (VRES), namely wind, solar and hydro power. Energy demand, as well as investment options for energy supply technologies, their related costs and operational characteristics, are exogenous input data in the model. The output supports decisions regarding technology choices, investment volume and investment timing with requirements of ensuring a reliable energy system at minimum cost. The model output also supports short-term operational decisions of energy system components under uncertainty. The model is subject to operational uncertainty, so the stochastic scenarios represent different realizations of the following: (1) Availability of VRES (wind and solar), (2) availability of hydro reservoirs and (3) hourly electricity loads.",
    github: "https://github.com/ntnuiotenergy/OpenEMPIRE",
    docs: "https://openempire.readthedocs.io/en/latest/",
    nav: [
      { path: "overview", label: "Overview" },
      { path: "data", label: "Edit data" },
      { path: "config", label: "Edit Config" },
      { path: "run", label: "Run model" },
      { path: "results", label: "Results" },
      { path: "viz", label: "Streamlit" }
    ],
    endpoints: {
      upload: "/api/models/ensolve_v1/upload",
      run: "/api/models/ensolve_v1/run",
      status: "/api/models/ensolve_v1/status",
      download: "/api/models/ensolve_v1/results",
      configGet: "/api/models/ensolve_v1/config",
      configPut: "/api/models/ensolve_v1/config"
    },
    features: { supportsStreamlit: true },
    loadPlugin: () => import("./plugins/ensolve_v1").then((m) => m.default)
  },
  {
    id: "emx",
    name: "EMX North Sea Case",
    description: "Case Study Description\n\nThe North Sea case study covers the macro-region comprising the North Sea basin and its surrounding countries: Great Britain, the Netherlands, Germany, Denmark, and Norway. Each country is modelled at NUTs2 resolution, resulting in 104 nodes in total (see picture).\n\nInvestments in transmission, generation, and storage are fixed and obtained from the E3M Geomec model (https://github.com/e3modelling/GeoMEC). Based on this system design, EMX determines the least-cost operation of the system.\n\nBoth the electricity and heat sectors are optimised at hourly resolution to capture the full temporal variability of supply and demand. A receding horizon is implemented that can be configured by the user, meaning the full planning horizon is solved as a series of sequential subproblems. In addition, CO₂ emissions are penalised via a carbon price rather than constrained by a hard limit.",
    github: "https://github.com/EnergyModelsX",
    docs: "https://joss.theoj.org/papers/10.21105/joss.06619",
    nav: [
      { path: "overview", label: "Overview" },
      { path: "config", label: "Edit Config" },
      { path: "run", label: "Run model" },
      { path: "results", label: "Results" }
    ],
    endpoints: {
      run: "/api/emx/runModel/run-script",
      status: "/api/emx/runHistory/status",
      download: "/api/emx/results",
      configGet: "/api/emx/config",
      configPut: "/api/emx/config"
    },
    features: { supportsStreamlit: false },
    loadPlugin: () => import("./plugins/emx").then((m) => m.default)
  },
  {
    id: "transcomp",
    name: "TransComp Model",
    description: "The transcompmodel is a model to determine the transition to low-emission transport at more granular geographic level than country-level, encompassing vehicle stock modeling, modal shift and technological substitution. It is based on a large-scale charging infrastructure planning tool for long-distance transport and has been adapted to be flexible in the scope of included modes and technologies.\n\nIt is an optimization model which allows to softlink with energy system and transport models by introducing outputs of these as parameters. Further, different kinds of policies can be introduced.",
    github: "https://github.com/antoniamgolab/iDesignRES_transcompmodel",
    docs: "https://antoniamgolab.github.io/iDesignRES_transcompmodel/",
    nav: [
      { path: "overview", label: "Overview" },
      { path: "data", label: "Edit data" },
      { path: "config", label: "Edit Config" },
      { path: "run", label: "Run model" },
      { path: "results", label: "Results" }
    ],
    endpoints: {
      data: "/api/transcomp/data",
      run: "/api/transcomp/runModel",
      status: "/api/transcomp/runHistory/status",
      download: "/api/transcomp/results",
      configGet: "/api/transcomp/config",
      configPut: "/api/transcomp/config"
    },
    features: { supportsStreamlit: false },
    loadPlugin: () => import("./plugins/transcomp").then((m) => m.default)
  },
  {
    id: "gcam",
    name: "GCAM",
    description: "The Global Change Analysis Model (GCAM) is an open-source integrated assessment model that represents interactions among energy, economy, land, water, and climate systems. This web integration provides reference and policy-run workflows with configurable runtime options.",
    github: "https://github.com/JGCRI/gcam-core",
    docs: "http://jgcri.github.io/gcam-doc/",
    nav: [
      { path: "overview", label: "Overview" },
      { path: "config", label: "Edit Config" },
      { path: "run", label: "Run model" },
      { path: "results", label: "Results" }
    ],
    endpoints: {
      run: "/api/gcam/runModel/run-script",
      status: "/api/gcam/runHistory/status",
      download: "/api/gcam/results",
      configGet: "/api/gcam/config",
      configPut: "/api/gcam/config"
    },
    features: { supportsStreamlit: false },
    loadPlugin: () => import("./plugins/gcam").then((m) => m.default)
  },
  {
    id: "ukraine",
    name: "PyPSA Ukraine FBMC",
    description: "Flow-based market coupling (FBMC) of the European day-ahead electricity market with a high-resolution Ukrainian network, built with PyPSA. Pick a window of the 2023 reference year and N-0 or N-1 security; the platform computes zonal prices, net positions, FBMC capacities and load shedding with Gurobi (HiGHS fallback) and returns a slim result profile with KPIs and CSV downloads.\n\nThe underlying FBMC model and code were developed by Wouter Koks and Amel de Kok and released as the open-source pypsa-fbmc project; this web integration runs their implementation on a PyPSA-Eur network of Ukraine and Moldova coupled to the rest of Europe.",
    github: "https://github.com/WouterKoksNL/pypsa-fbmc",
    docs: "/docs/ukraine_fbmc_guide.html",
    nav: [
      { path: "overview", label: "Overview" },
      { path: "config", label: "Edit Config" },
      { path: "run", label: "Run model" },
      { path: "results", label: "Results" }
    ],
    endpoints: {
      run: "/api/ukraine/runModel/run-script",
      status: "/api/ukraine/runHistory/status",
      download: "/api/ukraine/results",
      configGet: "/api/ukraine/config",
      configPut: "/api/ukraine/config"
    },
    features: { supportsStreamlit: false },
    loadPlugin: () => import("./plugins/ukraine").then((m) => m.default)
  }
];

export const getModelById = (id) => models.find((m) => m.id === id);
