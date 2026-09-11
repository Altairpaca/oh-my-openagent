import { type CheckpointUlwLoopArgs, type CheckpointUlwLoopResult, checkpointUlwLoop } from "./checkpoint.js";
import { recordEvidence } from "./evidence.js";
import { type UlwLoopScope, ulwLoopAttemptEvidenceDir } from "./paths.js";
import { addUlwLoopGoal, createUlwLoopPlan, startNextUlwLoop, summarizeUlwLoopPlan } from "./plan-crud.js";
import { readUlwLoopPlan } from "./plan-io.js";
import {
	type RecordFinalReviewBlockersArgs,
	type RecordFinalReviewBlockersResult,
	recordFinalReviewBlockers,
} from "./review-blockers.js";
import { UlwLoopError } from "./runtime.js";
import { statusNextActions } from "./status-next-actions.js";
import { steerUlwLoop } from "./steering.js";
import type { UlwLoopSteeringProposal } from "./steering-types.js";
import type { UlwLoopPlan } from "./types.js";

export type ToolkitSurface = "omo-senpi" | "lazycodex";
export interface ToolkitContext {
	readonly cwd: string;
	readonly sessionId: string;
	readonly surface: ToolkitSurface;
}

export const ULW_LOOP_OPERATIONS = [
	"help",
	"create-goals",
	"status",
	"complete-goals",
	"checkpoint",
	"steer",
	"add-goal",
	"criteria",
	"record-evidence",
	"record-review-blockers",
] as const;
export type UlwLoopOperation = (typeof ULW_LOOP_OPERATIONS)[number];

export interface ToolkitOperationManifest {
	readonly name: UlwLoopOperation;
	readonly mutating: boolean;
}
export const ULW_LOOP_MANIFEST = {
	version: 1,
	name: "ulw-loop",
	operations: [
		{ name: "help", mutating: false },
		{ name: "create-goals", mutating: true },
		{ name: "status", mutating: false },
		{ name: "complete-goals", mutating: true },
		{ name: "checkpoint", mutating: true },
		{ name: "steer", mutating: true },
		{ name: "add-goal", mutating: true },
		{ name: "criteria", mutating: false },
		{ name: "record-evidence", mutating: true },
		{ name: "record-review-blockers", mutating: true },
	] satisfies readonly ToolkitOperationManifest[],
} as const;

export type CreateGoalsArgs = Parameters<typeof createUlwLoopPlan>[1];
export type CompleteGoalsArgs = Parameters<typeof startNextUlwLoop>[1];
export type SteerArgs = UlwLoopSteeringProposal;
export type AddGoalArgs = Parameters<typeof addUlwLoopGoal>[1];
export type RecordEvidenceArgs = Parameters<typeof recordEvidence>[1];
export type CriteriaArgs = { readonly goalId: string };
export type CheckpointArgs = CheckpointUlwLoopArgs;
export type RecordReviewBlockersArgs = RecordFinalReviewBlockersArgs;

export type ToolkitDispatchRequest =
	| { readonly operation: "help"; readonly args?: Record<never, never> }
	| { readonly operation: "create-goals"; readonly args: CreateGoalsArgs }
	| { readonly operation: "status"; readonly args?: Record<never, never> }
	| { readonly operation: "complete-goals"; readonly args?: CompleteGoalsArgs }
	| { readonly operation: "checkpoint"; readonly args: CheckpointArgs }
	| { readonly operation: "steer"; readonly args: SteerArgs }
	| { readonly operation: "add-goal"; readonly args: AddGoalArgs }
	| { readonly operation: "criteria"; readonly args: CriteriaArgs }
	| { readonly operation: "record-evidence"; readonly args: RecordEvidenceArgs }
	| { readonly operation: "record-review-blockers"; readonly args: RecordReviewBlockersArgs };

export interface ToolkitError {
	readonly code: string;
	readonly message: string;
	readonly details?: Readonly<Record<string, string>>;
}
export interface ToolkitSuccess<Operation extends UlwLoopOperation, Result> {
	readonly ok: true;
	readonly operation: Operation;
	readonly result: Result;
	readonly nextActions: readonly string[];
	readonly warnings?: readonly string[];
}
export interface ToolkitFailure<Operation extends string = string> {
	readonly ok: false;
	readonly operation: Operation;
	readonly error: ToolkitError;
}
export type ToolkitResponse<Result> = ToolkitSuccess<UlwLoopOperation, Result> | ToolkitFailure;

type StatusResult = {
	readonly plan: UlwLoopPlan;
	readonly summary: ReturnType<typeof summarizeUlwLoopPlan>;
	readonly nextActions: readonly string[];
	readonly currentAttemptDir?: string;
};
type CriteriaResult = { readonly goalId: string; readonly criteria: UlwLoopPlan["goals"][number]["successCriteria"] };
type ResultFor<Operation extends UlwLoopOperation> = Operation extends "help"
	? typeof ULW_LOOP_MANIFEST
	: Operation extends "create-goals"
		? Awaited<ReturnType<typeof createUlwLoopPlan>>
		: Operation extends "status"
			? StatusResult
			: Operation extends "complete-goals"
				? Awaited<ReturnType<typeof startNextUlwLoop>>
				: Operation extends "checkpoint"
					? CheckpointUlwLoopResult
					: Operation extends "steer"
						? Awaited<ReturnType<typeof steerUlwLoop>>
						: Operation extends "add-goal"
							? Awaited<ReturnType<typeof addUlwLoopGoal>>
							: Operation extends "criteria"
								? CriteriaResult
								: Operation extends "record-evidence"
									? Awaited<ReturnType<typeof recordEvidence>>
									: Operation extends "record-review-blockers"
										? RecordFinalReviewBlockersResult
										: never;
type ResponseFor<Operation extends UlwLoopOperation> = ToolkitSuccess<Operation, ResultFor<Operation>> | ToolkitFailure;
export type ToolkitOperationResponse = {
	[Operation in UlwLoopOperation]: ResponseFor<Operation>;
}[UlwLoopOperation];

export interface ToolkitOperationHookEvent {
	readonly operation: UlwLoopOperation;
	readonly context: ToolkitContext;
	readonly response: { readonly ok: boolean };
}
export interface ToolkitHostHooks {
	readonly onOperation?: (event: ToolkitOperationHookEvent) => void | Promise<void>;
}
export interface AgentToolkitDependencies {
	readonly hooks?: ToolkitHostHooks;
}

export interface AgentToolkit {
	readonly dispatch: (
		request: ToolkitDispatchRequest | { readonly operation: string; readonly args?: Record<never, never> },
	) => Promise<ToolkitOperationResponse>;
	readonly help: () => Promise<ResponseFor<"help">>;
	readonly createGoals: (args: CreateGoalsArgs) => Promise<ResponseFor<"create-goals">>;
	readonly status: () => Promise<ResponseFor<"status">>;
	readonly completeGoals: (args?: CompleteGoalsArgs) => Promise<ResponseFor<"complete-goals">>;
	readonly checkpoint: (args: CheckpointArgs) => Promise<ResponseFor<"checkpoint">>;
	readonly steer: (args: SteerArgs) => Promise<ResponseFor<"steer">>;
	readonly addGoal: (args: AddGoalArgs) => Promise<ResponseFor<"add-goal">>;
	readonly criteria: (args: CriteriaArgs) => Promise<ResponseFor<"criteria">>;
	readonly recordEvidence: (args: RecordEvidenceArgs) => Promise<ResponseFor<"record-evidence">>;
	readonly recordReviewBlockers: (args: RecordReviewBlockersArgs) => Promise<ResponseFor<"record-review-blockers">>;
}

function validateContext(context: ToolkitContext): void {
	if (!context.cwd.trim()) throw new UlwLoopError("cwd is required.", "ULW_LOOP_CWD_REQUIRED");
	if (!context.sessionId.trim())
		throw new UlwLoopError("ULW_LOOP_SESSION_ID_REQUIRED: sessionId is required.", "ULW_LOOP_SESSION_ID_REQUIRED");
	if (context.surface !== "omo-senpi" && context.surface !== "lazycodex")
		throw new UlwLoopError("surface must be omo-senpi or lazycodex.", "ULW_LOOP_SURFACE_INVALID");
}

function errorDetails(error: UlwLoopError): ToolkitError {
	const details =
		error.details === undefined
			? undefined
			: Object.fromEntries(Object.entries(error.details).map(([key, value]) => [key, String(value)]));
	return details === undefined
		? { code: error.code, message: error.message }
		: { code: error.code, message: error.message, details };
}
function failure<Operation extends string>(operation: Operation, error: UlwLoopError): ToolkitFailure<Operation> {
	return { ok: false, operation, error: errorDetails(error) };
}
function caught<Operation extends string>(operation: Operation, error: Error): ToolkitFailure<Operation> {
	return failure(operation, error instanceof UlwLoopError ? error : new UlwLoopError(error.message, "ULW_LOOP_ERROR"));
}
function hasOperation<Operation extends UlwLoopOperation>(
	request: ToolkitDispatchRequest | { readonly operation: string; readonly args?: Record<never, never> },
	operation: Operation,
): request is Extract<ToolkitDispatchRequest, { readonly operation: Operation }> {
	return request.operation === operation;
}

export function createAgentToolkit(context: ToolkitContext, deps: AgentToolkitDependencies = {}): AgentToolkit {
	validateContext(context);
	const scope: UlwLoopScope = { sessionId: context.sessionId };
	const notify = async <Operation extends UlwLoopOperation>(
		operation: Operation,
		response: ResponseFor<Operation>,
	): Promise<ResponseFor<Operation>> => {
		if (deps.hooks?.onOperation !== undefined) await deps.hooks.onOperation({ operation, context, response });
		return response;
	};
	const invoke = async <Operation extends UlwLoopOperation>(
		operation: Operation,
		fn: () => Promise<ResultFor<Operation>>,
	): Promise<ResponseFor<Operation>> => {
		try {
			const result = await fn();
			const nextActions =
				result !== null && typeof result === "object" && "nextActions" in result && Array.isArray(result.nextActions)
					? result.nextActions.filter((action): action is string => typeof action === "string").slice(0, 8)
					: [];
			return await notify(operation, { ok: true, operation, result, nextActions });
		} catch (error) {
			const response = caught(operation, error instanceof Error ? error : new Error("ULW_LOOP_ERROR"));
			return notify(operation, response);
		}
	};
	const toolkit: AgentToolkit = {
		dispatch: async (request) => {
			if (hasOperation(request, "help")) return toolkit.help();
			if (hasOperation(request, "create-goals")) return toolkit.createGoals(request.args);
			if (hasOperation(request, "status")) return toolkit.status();
			if (hasOperation(request, "complete-goals")) return toolkit.completeGoals(request.args);
			if (hasOperation(request, "checkpoint")) return toolkit.checkpoint(request.args);
			if (hasOperation(request, "steer")) return toolkit.steer(request.args);
			if (hasOperation(request, "add-goal")) return toolkit.addGoal(request.args);
			if (hasOperation(request, "criteria")) return toolkit.criteria(request.args);
			if (hasOperation(request, "record-evidence")) return toolkit.recordEvidence(request.args);
			if (hasOperation(request, "record-review-blockers")) return toolkit.recordReviewBlockers(request.args);
			return failure(
				request.operation,
				new UlwLoopError(`Unknown operation: ${request.operation}`, "ULW_LOOP_OPERATION_UNKNOWN"),
			);
		},
		help: () => invoke("help", async () => ULW_LOOP_MANIFEST),
		createGoals: (args) => invoke("create-goals", () => createUlwLoopPlan(context.cwd, args, scope)),
		status: () =>
			invoke("status", async () => {
				const plan = await readUlwLoopPlan(context.cwd, scope);
				const active = plan.goals.find((goal) => goal.id === plan.activeGoalId);
				return {
					plan,
					summary: summarizeUlwLoopPlan(plan),
					nextActions: statusNextActions(plan),
					...(active === undefined
						? {}
						: { currentAttemptDir: ulwLoopAttemptEvidenceDir(active.id, active.attempt, scope) }),
				};
			}),
		completeGoals: (args = {}) => invoke("complete-goals", () => startNextUlwLoop(context.cwd, args, scope)),
		checkpoint: (args) =>
			invoke("checkpoint", () => checkpointUlwLoop(context.cwd, args, scope, { surface: context.surface })), 
		steer: (args) => invoke("steer", () => steerUlwLoop(context.cwd, args, scope)),
		addGoal: (args) => invoke("add-goal", () => addUlwLoopGoal(context.cwd, args, scope)),
		criteria: (args) =>
			invoke("criteria", async () => {
				const plan = await readUlwLoopPlan(context.cwd, scope);
				const goal = plan.goals.find((candidate) => candidate.id === args.goalId);
				if (goal === undefined)
					throw new UlwLoopError(`Unknown ulw-loop id: ${args.goalId}.`, "ULW_LOOP_GOAL_NOT_FOUND");
				return { goalId: goal.id, criteria: goal.successCriteria };
			}),
		recordEvidence: (args) => invoke("record-evidence", () => recordEvidence(context.cwd, args, scope)),
		recordReviewBlockers: (args) =>
			invoke("record-review-blockers", () => recordFinalReviewBlockers(context.cwd, args, scope)),
	};
	return toolkit;
}

export type { UlwLoopPlan } from "./types.js";
