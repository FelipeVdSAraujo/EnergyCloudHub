using YAML, JuMP, Dates, Gurobi, HiGHS

script_dir = @__DIR__
repo_root = normpath(joinpath(script_dir, "..", ".."))

function resolve_model_root(repo_root::String)
    env_root = get(ENV, "TRANSCOMP_MODEL_ROOT", "")
    candidates = String[]

    if !isempty(env_root)
        push!(candidates, normpath(env_root))
    end

    # Candidate 1: monorepo layout where model is nested in website repo.
    push!(candidates, normpath(joinpath(repo_root, "TransCompModel")))
    # Candidate 2: sibling layout where website_clone and TransCompModel share the same parent.
    push!(candidates, normpath(joinpath(repo_root, "..", "TransCompModel")))
    # Candidate 3: one level above sibling parent (defensive fallback for alternate checkouts).
    push!(candidates, normpath(joinpath(repo_root, "..", "..", "TransCompModel")))

    # Remove duplicates while preserving search order.
    seen = Set{String}()
    deduped_candidates = String[]
    for candidate in candidates
        if !(candidate in seen)
            push!(seen, candidate)
            push!(deduped_candidates, candidate)
        end
    end

    for candidate in deduped_candidates
        if isfile(joinpath(candidate, "src", "TransComp.jl"))
            return candidate
        end
    end

    error("Could not locate TransCompModel. Tried: $(join(deduped_candidates, ", "))")
end

model_root = resolve_model_root(repo_root)

include(joinpath(model_root, "src", "TransComp.jl"))
using .TransComp

function optimizer_from_name(name::AbstractString)
    return name == "Gurobi.Optimizer" ? Gurobi.Optimizer : HiGHS.Optimizer
end

function set_optional_attribute(model, key::AbstractString, value)
    if value === nothing
        return
    end
    set_optimizer_attribute(model, key, value)
end

function run_transcomp(run_name::String, input_dir::String, output_dir::String, config_path::String)
    config = YAML.load_file(config_path)
    constraints = get(config, "constraints", Dict())
    solver_options = get(config, "solverOptions", Dict())
    optimizer_name = String(get(config, "optimizer", "HiGHS.Optimizer"))
    optimizer = optimizer_from_name(optimizer_name)

    mkpath(output_dir)

    println("[TransComp] Run: $run_name")
    println("[TransComp] Model root: $model_root")
    println("[TransComp] Input directory: $input_dir")
    println("[TransComp] Output directory: $output_dir")
    println("[TransComp] Reading input data...")

    data_dict = get_input_data(input_dir)
    data_structures = parse_data(data_dict)
    model, data_structures = create_model(data_structures, run_name, optimizer)

    if get(constraints, "demandCoverage", true)
        constraint_demand_coverage(model, data_structures)
    end
    if get(constraints, "vehicleSizing", true)
        constraint_vehicle_sizing(model, data_structures)
    end
    if get(constraints, "vehicleAging", true)
        constraint_vehicle_aging(model, data_structures)
    end
    if get(constraints, "fuelingDemand", true)
        constraint_fueling_demand(model, data_structures)
    end
    if get(constraints, "vehicleStockShift", true)
        constraint_vehicle_stock_shift(model, data_structures)
    end
    if get(constraints, "modeShift", true)
        constraint_mode_shift(model, data_structures)
    end
    if get(constraints, "fuelingInfrastructure", true)
        constraint_fueling_infrastructure(model, data_structures)
    end
    if get(constraints, "modeInfrastructure", true)
        constraint_mode_infrastructure(model, data_structures)
    end
    if get(constraints, "monetaryBudget", false)
        constraint_monetary_budget(model, data_structures)
    end
    if get(constraints, "modeShareExact", false)
        constraint_mode_share(model, data_structures)
    end
    if get(constraints, "modeShareMin", false)
        constraint_min_mode_share(model, data_structures)
    end
    if get(constraints, "modeShareMax", false)
        constraint_max_mode_share(model, data_structures)
    end
    if get(constraints, "marketShare", false)
        constraint_market_share(model, data_structures)
    end
    if get(constraints, "emissionsByMode", false)
        constraint_emissions_by_mode(model, data_structures)
    end
    if get(constraints, "supplyInfrastructure", false)
        constraint_supply_infrastructure(model, data_structures)
    end

    objective(model, data_structures)

    gap = get(solver_options, "mipGap", nothing)
    time_limit = get(solver_options, "timeLimitSeconds", nothing)
    threads = get(solver_options, "threads", nothing)

    if gap !== nothing
        set_optional_attribute(model, optimizer_name == "Gurobi.Optimizer" ? "MIPGap" : "mip_rel_gap", gap)
    end
    if time_limit !== nothing && time_limit > 0
        set_optional_attribute(model, optimizer_name == "Gurobi.Optimizer" ? "TimeLimit" : "time_limit", time_limit)
    end
    if threads !== nothing && threads > 0
        set_optional_attribute(model, optimizer_name == "Gurobi.Optimizer" ? "Threads" : "threads", threads)
    end

    println("[TransComp] Solving model...")
    optimize!(model)
    solution_summary(model)

    println("[TransComp] Writing results...")
    save_results(model, run_name, data_structures, true, output_dir)
    println("[TransComp] Results saved successfully")
end

if length(ARGS) != 4
    error("Usage: transcomp_run.jl <run_name> <input_dir> <output_dir> <config_path>")
end

run_transcomp(ARGS[1], ARGS[2], ARGS[3], ARGS[4])