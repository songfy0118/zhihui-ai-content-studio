"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { formatEvidenceReviewBlocker } from "./evidence-review-diagnostics";
import { formatManualEvidenceBlocker, formatManualEvidencePublisherRole } from "./manual-evidence-diagnostics";
import { describeManualSourceLinkHost, listManualSourceNameSuggestions } from "./manual-source-options";
import { formatSourceLockAuthorizationBlocker } from "./source-lock-authorization-diagnostics";
import { formatSourceLockPlanBlocker } from "./source-lock-plan-diagnostics";

type Idea = { id:string; title:string; angle:string; category:string; status:string; douyinScore:number; tiktokScore:number; xhsScore:number; selected:boolean };
type Account = { platform:string; handle:string|null; status:string; publishMode:string };
type Job = { id:string; ideaId:string; stage:string; progress:number; status:string; platforms:string };
type ReviewAudit = { id:string; jobId:string; action:string; checks:Record<string,boolean>|null; publishTriggered:boolean; createdAt:string; malformed?:boolean };
type Metric = { platform:string; views:number; likes:number; comments:number; shares:number; saves:number; completionRate:number };
type NewsSourceCatalogStatus = { status:"loading"|"catalog_ready"|"catalog_blocked"|"unavailable";summary:{totalSources:number;enabledSources:number;rssSources:number;officialNewsrooms:number;manualReviewSources:number};sources:Array<{id:string;name:string;baseUrl:string;sourceType:string;enabled:boolean;requiresLogin:boolean;editorialAliases?:string[]}>;contentFetched:boolean;externalCalls:boolean;databaseWrites:boolean };
type NewsPreviewStatus = { status:"preview_ready"|"no_live_items";fetchedAt:string;summary:{feedsAttempted:number;readySources:number;failedSources:number;itemsReturned:number};sourceHealth:Array<{sourceId:string;status:"ready"|"empty"|"error";itemsParsed:number;errorCode:string|null;failureClass:string|null;retryable:boolean;operatorAction:string|null}>;transportAssessment:{status:"not_assessed"|"all_feeds_reachable"|"mixed_reachability"|"all_feeds_failed_inconclusive";reachableSources:number;failedSources:number;tlsOrProxyFailures:number;runtimeOutboundReachable:boolean;globalOutageProven:false;operatorAction:string|null};items:Array<{id:string;sourceName:string;title:string;summary:string;canonicalUrl:string;publishedAt:string|null}>;contentFetched:boolean;factsVerified:boolean;humanReviewRequired:boolean;externalCalls:number;databaseWrites:boolean;publishTriggered:boolean };
type TopicClusterPreview = { status:"clusters_ready"|"no_items";summary:{itemsConsidered:number;clusterCount:number;crossSourceClusters:number;eligibleCandidates:number;similarityThreshold:number;windowHours:number};clusters:Array<{id:string;title:string;status:string;itemCount:number;sourceCount:number;sourceIds:string[];firstSeenAt:string|null;lastSeenAt:string|null;meanSimilarity:number|null;crossSourceConfirmed:boolean;timeWindowVerified:boolean;eligibleForHotspotScoring:boolean}>;factsVerified:boolean;heatScored:boolean;externalCalls:number;databaseWrites:boolean;publishTriggered:boolean };
type TopicRankingPreview = { status:"ranked_candidates_ready"|"no_eligible_candidates";profile:{id:string;label:string;calibration:string;categoryCoverage:{categoriesPresent:number;mappedCategories:number;unmappedCategories:string[];complete:boolean}};summary:{clustersConsidered:number;eligibleClusters:number;rankedCandidates:number;blockedBeforeScoring:number};candidates:Array<{id:string;title:string;sourceCount:number;itemCount:number;trendEvidenceScore:number;accountFitScore:number;relativePriorityScore:number;matchedAccountTopics:string[];predictedViews:null;viralProbability:null;factsVerified:false;selectableForDraft:false}>;nextGate:"human_source_and_fact_review"|"human_evidence_gap_shortlist"|"wait_for_more_sources";evidenceGapFallback:EvidenceGapPreview|null;scoreKind:string;heatScored:boolean;factsVerified:boolean;predictedViewsGenerated:boolean;viralProbabilityGenerated:boolean;accountMetricsUsed:boolean;humanSelectionUnlocked:boolean;externalCalls:number;databaseWrites:boolean;publishTriggered:boolean };
type EvidenceGapPreview = { status:"evidence_gaps_ready"|"no_recent_account_fit_leads";profile:{id:string;label:string;calibration:string};summary:{clustersConsidered:number;recentSingleSourceLeads:number;leadsReturned:number;independentSourcesStillRequired:number;sourcesRepresented:number;languagesRepresented:Array<"zh-CN"|"en">;maxLeadsPerSource:number;windowHours:number;minimumAccountFit:number};leads:Array<{id:string;title:string;category:string;sourceId:string;publishedAt:string;ageHours:number;accountFitScore:number;matchedAccountTopics:string[];status:"needs_independent_source";missingIndependentSources:1;queryLanguage:"zh-CN"|"en"|"und";suggestedQueries:string[];shortlistableForEvidenceSearch:true;factsVerified:false;sourceLockReady:false;selectableForDraft:false}>;humanShortlistPersisted:false;evidenceSearchTriggered:false;factsVerified:false;sourceLocksCreated:0;draftsUnlocked:0;externalCalls:number;databaseWrites:false;publishTriggered:false };
type EvidenceSearchPlanPreview = { status:"search_plan_ready"|"search_plan_blocked";readyForHumanResearchReview:boolean;blockers:string[];selection:{requested:number;accepted:number;maximum:number};targets:Array<{leadId:string;title:string;originalSourceId:string;sourcePublishedAt:string;originalEvidence:Array<{id:string;sourceId:string;sourceName:string;title:string;canonicalUrl:string;publishedAt:string}>;status:"planned_not_executed";queries:string[];allowedSources:Array<{id:string;name:string;sourceType:string;baseUrl:string;feedUrl:string|null;collectionMode:"rss_metadata_only"|"manual_public_page_review";automaticCollectionBlockedReason:string|null}>;allowedSourceSummary:{rssMetadataSources:number;manualPublicPageSources:number};independenceDiagnostics:{policy:"source_id_and_exact_normalized_host";originalHosts:string[];excludedSources:Array<{id:string;name:string;host:string|null;reason:"same_source_id"|"same_exact_host"}>};requiredIndependentSources:number;resultsFound:0;claimsVerified:0;sourceLockReady:false}>;planFingerprint:string|null;allowedMethods:string[];prohibitedMethods:string[];automaticSearchAllowed:false;searchTriggered:false;factsVerified:false;sourceLocksCreated:0;draftsUnlocked:0;databaseWrites:false;publishTriggered:false;externalCalls:number };
type EvidenceMetadataPreview = { status:"metadata_preview_blocked"|"metadata_candidates_found"|"no_metadata_candidates";blockers:string[];planFingerprint:string|null;summary:{targetsReviewed:number;itemsConsidered:number;candidatesReturned:number};targets:Array<{leadId:string;title:string;originalSourceId:string;originalEvidence:{id:string;sourceId:string;sourceName:string;title:string;canonicalUrl:string;publishedAt:string}|null;originalHost:string|null;candidateCount:number;candidates:Array<{id:string;sourceId:string;sourceName:string;title:string;canonicalUrl:string;publishedAt:string;candidateHost:string|null;publishedDeltaHours:number;titleSimilarity:number;sharedTerms:string[];reviewStatus:"human_review_required"}>;sourceLockReady:false;factsVerified:false}>;searchScope:string;feedMetadataMatched:boolean;articleBodiesFetched:false;humanReviewRequired?:true;factsVerified:false;sourceLocksCreated:0;draftsUnlocked:0;databaseWrites:false;publishTriggered:false;externalCalls:number };
type ManualEvidenceDraft = { leadId:string;sourceName:string;publisherRole:""|"original_publisher"|"syndicated_or_repost";title:string;canonicalUrl:string;publishedAt:string };
type ManualEvidencePreview = { status:"manual_evidence_preview_ready"|"manual_evidence_preview_blocked";readyForHumanEvidenceReview:boolean;blockers:string[];summary?:{inputsReceived:number;candidatesAccepted:number;maximum:number};targets?:Array<{leadId:string;originalEvidence:{canonicalUrl:string}|null;originalHost:string|null;candidates:Array<{id:string;sourceName:string;publisherRole:"original_publisher"|"syndicated_or_repost";title:string;canonicalUrl:string;candidateHost:string;publishedDeltaHours:number}>}>;candidateUrlFetched:false;articleBodiesFetched:false;manualInputPersisted:false;factsVerified:false;sourceLocksCreated:0;draftsUnlocked:0;databaseWrites:false;publishTriggered:false;externalCalls:number };
type EvidenceReviewCheckId = "same_event_confirmed"|"source_independence_confirmed"|"publisher_relationship_checked"|"syndication_or_citation_chain_checked"|"dates_consistent"|"no_material_conflict_found";
type EvidenceReviewDecision = { candidateId:string;candidateMode:"rss_metadata"|"manual_public_metadata";checks:Record<EvidenceReviewCheckId,boolean> };
type EvidenceReviewPreview = { status:"evidence_review_preview_ready"|"evidence_review_preview_blocked";humanEvidenceReviewComplete:boolean;readyForAuthorizedSourceLockSave:boolean;blockers:string[];downstreamBlockers:string[];manualEvidenceUsed?:boolean;planFingerprint:string|null;reviewFingerprint:string|null;summary:{targetsRequired:number;targetsReviewed:number;targetsEligible:number};semanticReview:string;persisted:false;sourceLockCreated:false;factsVerified:false;draftsUnlocked:0;databaseWrites:false;publishTriggered:false;externalCalls:number };
type SourceLockSavePlan = { status:"source_lock_save_plan_ready"|"source_lock_save_plan_blocked";readyForAuthorizationRequest:boolean;blockers:string[];reviewFingerprint:string|null;savePlanFingerprint:string|null;plannedRecordCount:number;authorizationRequired:true;authorizationGranted:false;singleUseAuthorizationRequired:true;writeAllowed:false;persisted:false;sourceLocksCreated:0;factsVerified:false;draftsUnlocked:0;databaseWrites:false;publishTriggered:false;externalCalls:number };
type SourceLockSaveAuthorizationPreview = { status:"source_lock_save_authorization_preview_ready"|"source_lock_save_authorization_preview_blocked";blockers:string[];sourceSavePlanFingerprint:string|null;sourceReviewFingerprint:string|null;authorizationPreviewFingerprint:string|null;requiredConfirmation:string|null;eligibleForExplicitSourceLockSaveAuthorization:boolean;singleUseAuthorizationRequired:true;sourceLockSaveAuthorizationGranted:false;liveSaveRouteConnected:false;writeAllowed:false;databaseWriteAttempted:false;databaseWrites:false;persisted:false;sourceLocksCreated:0;draftsUnlocked:0;externalCalls:false;publishTriggered:false;businessResult:false };
type MetricFeedStatus = { status:"loading"|"verified"|"awaiting_verified_import"|"storage_unavailable";realDataOnly:boolean;recordsExcluded:number;acceptedSources:string[];writePerformed:boolean;publishTriggered:boolean };
type MetricsMigrationStatus = { mode:string;localOnly:boolean;migrationTag:string;authorizationRequired:boolean;readyToApplyLocally:boolean;blockers:string[];applyPerformed:boolean;databaseWrites:boolean;storage?:{status:string;verified:boolean;columnsPresent:string[];missingColumns:string[];indexPresent:boolean} };
type D1MigrationChainStatus = { mode:string;localOnly:boolean;authorizationRequired:boolean;status:"loading"|"empty"|"incomplete"|"current";current:boolean;emptyApplicationSchema:boolean;completedSteps:number;totalSteps:number;firstPending:string|null;blockers:string[];databaseWrites:boolean;applyPerformed:boolean };
type IsolatedChainVerification = { status:"loading"|"verified"|"failed"|"unavailable";verified:boolean;appliedTags:string[];completedSteps:number;totalSteps:number;blockers:string[];rollbackPerformed:boolean;rollbackVerified:boolean|null;ephemeralDatabaseWrites:boolean;liveDatabaseWrites:boolean;liveApplyPerformed:boolean;businessResult:boolean };
type LocalEngine = { ready:boolean; mode:"local"|"cloud"; textConfigured?:boolean; studioUrl?:string; message?:string };
type LocalProject = { id:string|number; title:string; projectUrl:string; storyTaskId:string|null; nextAction:"story_generating"|"configure_text_model"|"story_ready"|"storyboards_ready"|"packaging_ready"; status?:string; episodeCount?:number; storyboardCount?:number; sourceIdeaId?:string|null; packagePlatforms?:string[] };
type Preflight = { ready:boolean; mode:"local"|"cloud"; stages:Array<{id:string;label:string;ready:boolean;required:boolean;detail:string;action?:string;diagnosticCode?:string;verification?:"verified"|"not_run";automaticTest?:boolean}>; blockers?:string[]; settingsUrl?:string; message?:string; verificationNotice?:string };
type PackageReadiness = { eligible:boolean; mode:"local"|"cloud"; blockers:string[]; checks:Array<{id:string;ready:boolean;detail:string}>; factReviewEvidence?:{ready:boolean;claimCount:number;sourceCount:number;distinctHostCount:number;citedClaimCount:number;networkVerification:"not_run"}; error?:string; engineOutputs?:{storyboardCount:number;sceneVideoCount:number;storyboardAudioReadyCount:number;audioFileCount:number;finalVideoCount:number;completedMergeCount:number}; generationPlan?:{automaticExecution:boolean;generatedMedia:boolean;nextStageIds:string[];stages:Array<{id:string;label:string;engine:string;ready:boolean;completed:number;total:number;detail:string;engineReady:boolean;engineStatus:string;blockerCode:string|null;blockerDetail:string|null;authorizationRequired:boolean}>;pilotApproval:null|{storyboardId:number|string;storyboardNumber:number;title:string;duration:number;aspectRatio:string;requestHash:string;inputComplete:boolean;promptsReturned:boolean;plannedOperations:Array<{id:string;engine:string;callType:string;count:number}>;externalModelCalls:number;localInferenceCalls:number;costEstimate:null;costStatus:string;approvalInputs?:{provider:null;imageModel:null;videoModel:null;imageCostCny:null;videoCostCny:null;pricingConfirmed:false;maxCostCny:null;approvedRequestHash:null};executionGate?:{eligible:boolean;status:string;blockers:string[];approvalScope:string;automaticExecution:boolean;secretsConsumed:boolean;externalCalls:boolean;costIncurred:boolean};userApprovalRequired:boolean;userApproved:boolean;readyToExecute:boolean;willExecute:boolean;generatedMedia:boolean;publishable:boolean}}; sync?:{changed:boolean;registered:Array<{kind:string;file:string;sha256:string;source:string}>;missingKinds:string[];mediaStatus:string} };
type LocalEngineStatus = { id:string;name:string;role:string;codePresent:boolean;modelReady:boolean;ready:boolean;status:string;detail:string;action:string;downloadRequired:boolean;url?:string;configuration?:{readyForPilot:boolean;status:string;routes:Array<{id:string;label:string;requiredForPilot:boolean;configured:boolean;capability:string}>;configuredKeyNames:string[];detectedSources:string[];secretsReturned:boolean;externalCalls:boolean;verification:string;costIncurred:boolean;nextAction:string};installPreflight?:{model:{sourceUrl:string;reportedGiB:number};hardware:{gpuName:string;gpuMemoryGiB:number;gpuAssessment:string};disk:{freeGiB:number;requiredFreeGiB:number;ready:boolean};runtime:{dedicatedEnvPresent:boolean;recommendedPython:string;currentPython:string;ffmpegReady:boolean};readyToPrepareEnvironment:boolean;readyToRun:boolean;planAvailable:boolean;planCommand:string;smokePlanAvailable:boolean;smokePlanCommand:string;approvalRequired:boolean;downloadTriggered:boolean;nextAction:string};lipSyncPreflight?:{model:{sourceUrl:string;requiredModelFiles:number;presentModelFiles:number;ready:boolean;sizeVerification:string};hardware:{gpuName:string;gpuMemoryGiB:number;gpuAssessment:string;performanceClaim:string};disk:{freeGiB:number;requiredFreeBytes:null;ready:null;detail:string};runtime:{dedicatedEnvPresent:boolean;recommendedPython:string;documentedCuda:string;ffmpegReady:boolean;candidateReady:boolean;inferenceVerified:boolean};routePolicy:{defaultForScienceComic:boolean;useWhen:string;requiredInputs:string[];outputUse:string};readyForSmokeTest:boolean;readyForProduction:boolean;approvalRequired:boolean;downloadTriggered:boolean;inferenceTriggered:boolean;generatedMedia:boolean;externalCalls:boolean;costIncurred:boolean;nextAction:string} };
type MoneyPrinterPreflight = { engine:{configurationPresent:boolean;configurationRead:boolean;secretsReturned:boolean};runtime:{dedicatedEnvPresent:boolean;documentedPython:string;currentPython:string;ffmpegReady:boolean;verifiedByInference:boolean};sourcePolicy:{recommendedUntilReview:string;perAssetRightsRequired:boolean;rightsVerified:boolean;bundledMusicCount:number;bundledMusicAllowedForProduction:boolean};factPolicy:{mayDraftFromApprovedSources:boolean;mayEstablishNewsFacts:boolean;upstreamFactReviewRequired:boolean;newsFetched:boolean;factsVerified:boolean};routePolicy:{defaultForScienceComic:boolean;useWhen:string;preferredAudioInput:string;automaticPublish:boolean};readyForPlanning:boolean;readyForSmokeTest:boolean;readyForProduction:boolean;blockers:string[];automaticDownloads:boolean;externalCalls:boolean;costIncurred:boolean;generatedMedia:boolean;publishTriggered:boolean;nextAction:string };
type PilotApprovalPreview = { previewOnly:boolean;candidate:{storyboardId:number|string;storyboardNumber:number;duration:number;aspectRatio:string;requestHash:string};gate:{eligible:boolean;status:string;blockers:string[];executionRequestHash:string|null;imageCostCny:number|null;videoCostCny:number|null;quotedTotalCostCny:number|null;pricingConfirmed:boolean;maxCostCny:number|null;externalCalls:boolean;costIncurred:boolean};executionTriggered:boolean;generatedMedia:boolean;publishable:boolean;error?:string };
type ExecutionPreparationStatus = { status:string;blockers:string[];executorEnabled:boolean;receiptIssued:boolean;receiptConsumed:boolean;databaseWriteAttempted:boolean;migrationVerification:string;receiptTtlSeconds:number;adapterCallAuthorized:boolean;executionTriggered:boolean;externalCalls:boolean;costIncurred:boolean;generatedMedia:boolean;publishable:boolean };
type ReceiptMigrationReadiness = { mode:string;localOnly:boolean;readyToApplyLocally:boolean;blockers:string[];targetBinding:string;migrationTag:string;applyPerformed:boolean;databaseWrites:boolean;storage?:{status:string;tablePresent:boolean;missingIndexes:string[]};executorEnabled:boolean;executionTriggered:boolean;externalCalls:boolean;costIncurred:boolean;publishable:boolean };
type BridgeStatus = { status:"loading"|"current"|"stale"|"offline"|"blocked";current:boolean;expectedVersion:number;reportedVersion:number|null;requiredCapabilities:string[];reportedCapabilities:string[];missingCapabilities:string[];blockers:string[];restartRequired:boolean;restartTriggered:boolean;processMutation:boolean;externalCalls:boolean;costIncurred:boolean };
type LocalRuntimeStatus = { status:"loading"|"current"|"services_offline"|"bridge_stale"|"blocked";current:boolean;services:Array<{id:string;online:boolean;statusCode:number|null}>;offlineServices:string[];nextAction:string;processMutation:boolean;externalCalls:boolean;modelCalls:boolean;downloads:boolean;costIncurred:boolean;publishTriggered:boolean };
type SocialDraftHandoffStatus = { status:"loading"|"preview_only"|"unavailable";supportedPlatforms:string[];supportedModes:string[];interactiveLoginRequired:boolean;visibleBrowserRequired:boolean;verificationBypassAllowed:boolean;cookieExportAllowed:boolean;draftOnly:boolean;publishAllowed:boolean;publishActionImplemented:boolean;uploadTriggered:boolean;draftSaveTriggered:boolean;draftVerified:boolean;publishTriggered:boolean;packagePlan?:null|{status:string;readyForHumanDraftReview:boolean;blockers:string[];packageFingerprint:string|null;humanReviewStillRequired:boolean;content:{title:string|null;mediaPaths:string[]}} };
type LumenXAdapterPlan = { contractReady:boolean;blockers:string[];adapter:string;requestHash:string|null;steps:Array<{id:string;mode:string|null;modelId:string|null;dependsOn:string|null}>;catalogVerification:string;pricingVerified:boolean;promptBodiesReturned:false;requestBodiesReturned:false;dispatchAllowed:false;externalCalls:0;costIncurred:false;generatedMedia:false };
type PackageReadinessWithAdapter = PackageReadiness & { lumenxAdapterPlan?:LumenXAdapterPlan };
type SourceLockedScriptPlan = { mode:string;readyForAuthorization:boolean;blockers:string[];sourceLockFingerprint:string|null;adapter?:string;method?:string|null;endpoint?:string|null;claimCount:number;sourceCount:number;targetPlatforms:string[];downstream:null|{engine:string;status:string;requestCount:number;dispatchAllowed:false};premiseReturned:false;requestBodyReturned:false;authorizationRequired:boolean;dispatchAllowed:false;plannedModelCalls:number;modelCalls:0;externalCalls:0;costIncurred:false;scriptGenerated:false;generatedMedia:false;publishTriggered:false;businessResult:false };
type ScriptAcceptanceStatus = { mode:string;status:"loading"|"awaiting_script_output"|"awaiting_human_script_review"|"ready_for_character_and_storyboard"|"blocked";ready:boolean;blockers:string[];scriptOutputPresent:boolean;sourceLockFingerprint:string|null;counts:{knownClaims:number;accountedClaims:number;includedClaims:number;uncitedFactualClaims:number|null};semanticVerification:"human_required";automatedFactVerification:false;scriptContentReturned:false;modelCalls:0;externalCalls:false;costIncurred:false;generatedMedia:false;publishTriggered:false;businessResult:false;discovery?:{status:string;source:string;localReadCalls:number;projectCount:number;scriptProjectCount:number;artifact:null|{dramaId:number;sourceIdeaId:string|null;dramaStatus:string;episodeCount:number;scriptEpisodeCount:number;outputFingerprint:string|null;fingerprintAlgorithm:string|null;fingerprintScope:string|null;sourceLockProvenancePresent:boolean;metadataFactReviewPresent:boolean;updatedAt:string|null};scriptContentsReturned:false;externalCalls:false;databaseWrites:false};reviewDraft?:null|{status:string;reviewable:boolean;blockers:string[];outputFingerprint:string|null;plannedSourceLockFingerprint:string|null;reviewDraftFingerprint:string|null;checks:Array<{id:string;confirmed:false}>;confirmedChecks:0;totalChecks:number;reviewedAt:null;persisted:false;databaseWrites:false;semanticVerification:"not_run";automatedFactVerification:false;scriptContentsReturned:false} };
type ScriptReviewSession = { outputFingerprint:string|null; checks:Record<string,boolean> };
type ScriptReviewPreviewResponse = { preview:{status:string;previewComplete:boolean;blockers:string[];previewFingerprint:string|null;confirmedChecks:number;totalChecks:number;eligibleForAuthorizedSave:boolean;acceptanceBlockers:string[];previewOnly:true;acceptanceRecorded:false;downstreamUnlocked:false;persisted:false;databaseWrites:false;semanticVerification:string;automatedFactVerification:false;scriptContentsReturned:false;modelCalls:0;externalCalls:false;costIncurred:false;publishTriggered:false};current:{outputFingerprint:string|null;plannedSourceLockFingerprint:string|null;reviewDraftFingerprint:string|null};localReadCalls:number;scriptContentsReturned:false;databaseWrites:false;executionTriggered:false;error?:string };
type PreproductionGateStatus = { status:"loading"|"blocked"|"ready_for_character_storyboard_plan";ready:boolean;blockers:string[];outputFingerprint:string|null;plannedSourceLockFingerprint:string|null;sourceLockBound:boolean;persistedReviewAccepted:boolean;planningAllowed:boolean;authorizationRequired:true;runtimeVerification:"not_run";executionAllowed:false;characterGenerationTriggered:false;storyboardGenerationTriggered:false;localMiniDramaCalls:0;lumenXCalls:0;modelCalls:0;databaseWrites:false;externalCalls:false;costIncurred:false;generatedMedia:false;publishTriggered:false;businessResult:false;reviewRecordLookup?:string;localReadCalls?:number;scriptContentsReturned?:false };
type ScriptReviewAcceptanceResponse = { status?:string;accepted?:boolean;record?:{id:string;sourceIdeaId:string;dramaId:number;outputFingerprint:string;sourceLockFingerprint:string;status:string;reviewedAt:string;checks:Record<string,boolean>};error?:string;migrationRequired?:string;databaseWrites:boolean;downstreamUnlocked:boolean;modelCalls:0;externalCalls:false;costIncurred:false;generatedMedia:false;publishTriggered:false };
type ScriptApprovalPreview = { previewOnly:boolean;configurationStatus:string;gate:{eligible:boolean;status:string;blockers:string[];sourceLockFingerprint:string|null;executionRequestHash:string|null;quotedCostCny:number|null;maxCostCny:number|null;pricingConfirmed:boolean;modelCalls:0;externalCalls:0;costIncurred:false;scriptGenerated:false};executorAvailable:false;executionTriggered:false;modelCalls:0;externalCalls:0;costIncurred:false;scriptGenerated:false;generatedMedia:false;publishable:false;secretsReturned:false;error?:string };

const platformMeta = {
  douyin: { name:"抖音", region:"中国", color:"#ff4e45" },
  tiktok: { name:"TikTok", region:"美国", color:"#51e7dd" },
  xiaohongshu: { name:"小红书", region:"中国", color:"#ff2442" },
};
const evidenceReviewChecklist: Array<{id:EvidenceReviewCheckId;label:string}> = [
  { id:"same_event_confirmed", label:"两条公开来源确实报道同一事件" },
  { id:"source_independence_confirmed", label:"综合判断第二来源具有独立采编或发布责任" },
  { id:"publisher_relationship_checked", label:"已检查两家来源是否同集团、子品牌或内容合作关系" },
  { id:"syndication_or_citation_chain_checked", label:"第二来源不是转载、通稿复刻或仅引用原来源" },
  { id:"dates_consistent", label:"发布时间与事件时间没有明显冲突" },
  { id:"no_material_conflict_found", label:"标题和公开页面没有关键事实冲突" },
];
function ManualEvidenceReviewLinks({ preview, leadId, candidateId }:{ preview:ManualEvidencePreview|null;leadId:string;candidateId:string }) {
  const target = preview?.targets?.find((item)=>item.leadId===leadId);
  const candidate = target?.candidates.find((item)=>item.id===candidateId);
  if (!target || !candidate) return null;
  return <span>{target.originalEvidence&&<a href={target.originalEvidence.canonicalUrl} target="_blank" rel="noreferrer">审查时打开原始来源</a>}<a href={candidate.canonicalUrl} target="_blank" rel="noreferrer">审查时打开候选来源</a></span>;
}
const runtimeServiceLabels: Record<string,string> = { studio:"知绘操作台", bridge:"本机桥接", local_mini_drama_api:"漫剧后端", local_mini_drama_web:"漫剧前端" };
const rssOperatorActionLabels: Record<string,string> = { check_tls_or_proxy_and_retry:"检查 TLS/代理后重试", retry_later:"稍后重试", respect_retry_window:"遵守限流窗口", manual_source_review:"转人工检查来源", verify_feed_url:"核对 Feed 地址", review_source_limits:"复核来源大小限制", inspect_source_failure:"检查来源失败" };
const rssTransportLabels: Record<NewsPreviewStatus["transportAssessment"]["status"],string> = { not_assessed:"尚未判断链路", all_feeds_reachable:"全部 Feed 链路可达", mixed_reachability:"本机外网可达，个别来源链路失败", all_feeds_failed_inconclusive:"全部 Feed 失败，原因仍待人工诊断" };

const fallbackIdeas: Idea[] = [
  ["ai-layoffs","大厂继续裁员：程序员会成为下一个土木行业吗？","从公开裁员数据、岗位结构与AI投入拆开讨论，不把单一公司传闻写成行业结论","AI职场",94,88,96],
  ["ai-agent-work","AI Agent 正在接管哪些白领流程？","追踪企业官方案例，区分演示、试点与已经产生业务结果的部署","AI",92,91,95],
  ["chip-war","英伟达之后，AI 芯片的下一场战争在哪里？","比较训练、推理、存储和能耗瓶颈，避免只围绕单日股价讲故事","科技金融",89,93,91],
  ["rate-cut-tech","利率变化为什么先影响科技公司？","用融资成本、估值折现和招聘预算解释宏观变化如何传导到普通从业者","金融",86,90,94],
  ["open-source-ai","开源模型正在让闭源 AI 失去护城河吗？","按能力、成本、部署和生态四个维度核对，不用跑分替代真实业务效果","AI",88,94,92],
  ["coding-career","AI 会写代码之后，计算机专业还值得读吗？","把重复编码、系统设计、领域知识和岗位增长拆成四类能力","AI职场",96,89,97],
  ["robotics-factory","人形机器人离真正进厂还有多远？","只采用厂商公告与可验证试点，标注样机、试产和规模部署的差别","机器人",91,92,90],
  ["us-tech-policy","美国新的科技政策，真正影响了谁？","从政策原文出发，分别解释公司、投资者和技术从业者的影响","美国科技",87,95,89],
  ["ai-bubble","AI 是泡沫，还是新一轮基础设施周期？","把资本开支、收入、利润和生产率证据放在一张表里对照","科技金融",93,90,95],
  ["private-ai","你的公司为什么开始要求 AI 本地部署？","从数据合规、成本、延迟与模型效果解释私有化部署的真实取舍","企业AI",85,87,93],
].map(([id,title,angle,category,douyinScore,tiktokScore,xhsScore]) => ({ id:String(id), title:String(title), angle:String(angle), category:String(category), status:"candidate", douyinScore:Number(douyinScore), tiktokScore:Number(tiktokScore), xhsScore:Number(xhsScore), selected:false }));

const reviewChecklist = [
  { id:"facts_verified", label:"事实与数字已核对" },
  { id:"visuals_checked", label:"画面不存在明显 AI 错误" },
  { id:"audio_subtitles_checked", label:"配音和字幕无错字" },
  { id:"ai_label_enabled", label:"AI 内容标识已开启" },
  { id:"commercial_rights_confirmed", label:"音乐与素材允许商用" },
  { id:"platform_copy_checked", label:"三个平台标题分别检查" },
  { id:"human_publish_confirmation", label:"确认后仍由账号本人手动发布" },
] as const;
type ReviewCheckId = typeof reviewChecklist[number]["id"];
const readinessLabels: Record<string,string> = {
  fact_review:"事实与来源",
  platform_packages:"三平台包装",
  media_status:"成片状态",
  artifacts:"视频 / 音轨 / 字幕校验",
  human_gate:"人工审核门",
};
const approvalBlockerLabels: Record<string,string> = {
  image_cost_not_set:"图像调用报价未填写",
  video_cost_not_set:"视频调用报价未填写",
  pricing_not_confirmed:"报价尚未人工确认",
  cost_cap_exceeded:"预计合计超过最高预算",
  external_credential_missing:"密钥未配置",
  local_voice_not_ready:"本机配音未就绪",
  provider_not_selected:"供应商未选择",
  image_model_not_selected:"图像模型未选择",
  video_model_not_selected:"视频模型未选择",
  max_cost_not_set:"最高预算未设置",
  explicit_approval_missing:"尚未明确授权",
  request_fingerprint_mismatch:"授权指纹不一致",
  pilot_input_incomplete:"试片输入不完整",
};
const executionPreparationLabels: Record<string,string> = {
  executor_disabled:"真实执行器固定关闭",
  migration_missing:"票据迁移尚未应用",
  migration_incomplete:"票据表或索引结构不完整",
  database_unavailable:"数据库当前不可用",
  status_not_loaded:"执行准备状态尚未载入",
};

const scriptReviewCheckLabels: Record<string,string> = {
  source_lock_bound:"来源锁绑定",
  claim_usage_mapped:"主张使用映射",
  facts_match_source_lock:"事实与来源一致",
  no_uncited_factual_claims:"没有未引用事实",
  uncertainty_preserved:"保留不确定性",
  source_notes_present:"来源说明完整",
  platform_safety_checked:"平台安全检查",
};

export default function Home() {
  const [ideas, setIdeas] = useState<Idea[]>(fallbackIdeas);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [newsSourceCatalog, setNewsSourceCatalog] = useState<NewsSourceCatalogStatus>({ status:"loading", summary:{totalSources:0,enabledSources:0,rssSources:0,officialNewsrooms:0,manualReviewSources:0}, sources:[], contentFetched:false, externalCalls:false, databaseWrites:false });
  const [newsPreview, setNewsPreview] = useState<NewsPreviewStatus|null>(null);
  const [newsPreviewBusy, setNewsPreviewBusy] = useState(false);
  const [topicClusters, setTopicClusters] = useState<TopicClusterPreview|null>(null);
  const [topicClustersBusy, setTopicClustersBusy] = useState(false);
  const [topicRanking, setTopicRanking] = useState<TopicRankingPreview|null>(null);
  const [topicRankingBusy, setTopicRankingBusy] = useState(false);
  const [evidenceGaps, setEvidenceGaps] = useState<EvidenceGapPreview|null>(null);
  const [evidenceGapsBusy, setEvidenceGapsBusy] = useState(false);
  const [evidenceGapShortlist, setEvidenceGapShortlist] = useState<string[]>([]);
  const [evidenceSearchPlan, setEvidenceSearchPlan] = useState<EvidenceSearchPlanPreview|null>(null);
  const [evidenceSearchPlanBusy, setEvidenceSearchPlanBusy] = useState(false);
  const [evidenceMetadataPreview, setEvidenceMetadataPreview] = useState<EvidenceMetadataPreview|null>(null);
  const [evidenceMetadataBusy, setEvidenceMetadataBusy] = useState(false);
  const [manualEvidenceDraft, setManualEvidenceDraft] = useState<ManualEvidenceDraft>({ leadId:"", sourceName:"", publisherRole:"", title:"", canonicalUrl:"", publishedAt:"" });
  const [manualEvidencePreview, setManualEvidencePreview] = useState<ManualEvidencePreview|null>(null);
  const [manualEvidenceBusy, setManualEvidenceBusy] = useState(false);
  const [evidenceReviewDecisions, setEvidenceReviewDecisions] = useState<Record<string,EvidenceReviewDecision>>({});
  const [evidenceReviewPreview, setEvidenceReviewPreview] = useState<EvidenceReviewPreview|null>(null);
  const [evidenceReviewBusy, setEvidenceReviewBusy] = useState(false);
  const [sourceLockSavePlan, setSourceLockSavePlan] = useState<SourceLockSavePlan|null>(null);
  const [sourceLockSavePlanBusy, setSourceLockSavePlanBusy] = useState(false);
  const [sourceLockSaveAuthorizationPreview, setSourceLockSaveAuthorizationPreview] = useState<SourceLockSaveAuthorizationPreview|null>(null);
  const [sourceLockSaveAuthorizationPreviewBusy, setSourceLockSaveAuthorizationPreviewBusy] = useState(false);
  const [platforms, setPlatforms] = useState(["douyin", "tiktok", "xiaohongshu"]);
  const [view, setView] = useState("ideas");
  const [message, setMessage] = useState("正在载入你的内容工厂…");
  const [busy, setBusy] = useState(false);
  const [localEngine, setLocalEngine] = useState<LocalEngine>({ ready:false, mode:"cloud" });
  const [localProjects, setLocalProjects] = useState<LocalProject[]>([]);
  const [preflight, setPreflight] = useState<Preflight>({ ready:false, mode:"cloud", stages:[] });
  const [packageReadiness, setPackageReadiness] = useState<PackageReadinessWithAdapter>({ eligible:false, mode:"cloud", blockers:["local_evidence_unavailable"], checks:[] });
  const [localEngineRows, setLocalEngineRows] = useState<LocalEngineStatus[]>([]);
  const [syncBusy, setSyncBusy] = useState(false);
  const [reviewChecks, setReviewChecks] = useState<Record<ReviewCheckId, boolean>>(() => Object.fromEntries(reviewChecklist.map(({ id }) => [id, false])) as Record<ReviewCheckId, boolean>);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewAudits, setReviewAudits] = useState<ReviewAudit[]>([]);
  const [reviewHistoryStatus, setReviewHistoryStatus] = useState("暂无审核记录");
  const [pilotProvider, setPilotProvider] = useState("");
  const [pilotImageModel, setPilotImageModel] = useState("");
  const [pilotVideoModel, setPilotVideoModel] = useState("");
  const [pilotImageCost, setPilotImageCost] = useState("");
  const [pilotVideoCost, setPilotVideoCost] = useState("");
  const [pilotPricingConfirmed, setPilotPricingConfirmed] = useState(false);
  const [pilotMaxCost, setPilotMaxCost] = useState("");
  const [pilotConsent, setPilotConsent] = useState(false);
  const [pilotPreview, setPilotPreview] = useState<PilotApprovalPreview|null>(null);
  const [pilotApprovalReceipt, setPilotApprovalReceipt] = useState<{configKey:string;hash:string}|null>(null);
  const [pilotPreviewBusy, setPilotPreviewBusy] = useState(false);
  const [connectionRefreshBusy, setConnectionRefreshBusy] = useState(false);
  const [executionPreparation, setExecutionPreparation] = useState<ExecutionPreparationStatus>({ status:"blocked", blockers:["status_not_loaded"], executorEnabled:false, receiptIssued:false, receiptConsumed:false, databaseWriteAttempted:false, migrationVerification:"not_run", receiptTtlSeconds:600, adapterCallAuthorized:false, executionTriggered:false, externalCalls:false, costIncurred:false, generatedMedia:false, publishable:false });
  const [receiptMigration, setReceiptMigration] = useState<ReceiptMigrationReadiness>({ mode:"plan_only", localOnly:true, readyToApplyLocally:false, blockers:["status_not_loaded"], targetBinding:"DB", migrationTag:"0003_faithful_harry_osborn", applyPerformed:false, databaseWrites:false, executorEnabled:false, executionTriggered:false, externalCalls:false, costIncurred:false, publishable:false });
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ status:"loading", current:false, expectedVersion:3, reportedVersion:null, requiredCapabilities:[], reportedCapabilities:[], missingCapabilities:[], blockers:["status_not_loaded"], restartRequired:false, restartTriggered:false, processMutation:false, externalCalls:false, costIncurred:false });
  const [runtimeStatus, setRuntimeStatus] = useState<LocalRuntimeStatus>({ status:"loading", current:false, services:[], offlineServices:[], nextAction:"not_loaded", processMutation:false, externalCalls:false, modelCalls:false, downloads:false, costIncurred:false, publishTriggered:false });
  const [socialDraftHandoff, setSocialDraftHandoff] = useState<SocialDraftHandoffStatus>({ status:"loading", supportedPlatforms:[], supportedModes:[], interactiveLoginRequired:true, visibleBrowserRequired:true, verificationBypassAllowed:false, cookieExportAllowed:false, draftOnly:true, publishAllowed:false, publishActionImplemented:false, uploadTriggered:false, draftSaveTriggered:false, draftVerified:false, publishTriggered:false });
  const [metricFeedStatus, setMetricFeedStatus] = useState<MetricFeedStatus>({ status:"loading", realDataOnly:true, recordsExcluded:0, acceptedSources:["platform_api","platform_export"], writePerformed:false, publishTriggered:false });
  const [metricsMigration, setMetricsMigration] = useState<MetricsMigrationStatus>({ mode:"plan_only", localOnly:true, migrationTag:"0004_strange_doorman", authorizationRequired:true, readyToApplyLocally:false, blockers:["status_not_loaded"], applyPerformed:false, databaseWrites:false });
  const [migrationChain, setMigrationChain] = useState<D1MigrationChainStatus>({ mode:"plan_only", localOnly:true, authorizationRequired:true, status:"loading", current:false, emptyApplicationSchema:false, completedSteps:0, totalSteps:7, firstPending:null, blockers:["status_not_loaded"], databaseWrites:false, applyPerformed:false });
  const [isolatedChain, setIsolatedChain] = useState<IsolatedChainVerification>({ status:"loading", verified:false, appliedTags:[], completedSteps:0, totalSteps:7, blockers:["status_not_loaded"], rollbackPerformed:false, rollbackVerified:null, ephemeralDatabaseWrites:false, liveDatabaseWrites:false, liveApplyPerformed:false, businessResult:false });
  const [scriptPlan, setScriptPlan] = useState<SourceLockedScriptPlan>({ mode:"local", readyForAuthorization:false, blockers:["status_not_loaded"], sourceLockFingerprint:null, claimCount:0, sourceCount:0, targetPlatforms:[], downstream:null, premiseReturned:false, requestBodyReturned:false, authorizationRequired:true, dispatchAllowed:false, plannedModelCalls:0, modelCalls:0, externalCalls:0, costIncurred:false, scriptGenerated:false, generatedMedia:false, publishTriggered:false, businessResult:false });
  const [scriptAcceptance, setScriptAcceptance] = useState<ScriptAcceptanceStatus>({ mode:"local", status:"loading", ready:false, blockers:["status_not_loaded"], scriptOutputPresent:false, sourceLockFingerprint:null, counts:{knownClaims:0,accountedClaims:0,includedClaims:0,uncitedFactualClaims:null}, semanticVerification:"human_required", automatedFactVerification:false, scriptContentReturned:false, modelCalls:0, externalCalls:false, costIncurred:false, generatedMedia:false, publishTriggered:false, businessResult:false });
  const [scriptReviewSession, setScriptReviewSession] = useState<ScriptReviewSession>({ outputFingerprint:null, checks:{} });
  const [scriptReviewFingerprintConfirmed, setScriptReviewFingerprintConfirmed] = useState(false);
  const [scriptReviewPreview, setScriptReviewPreview] = useState<ScriptReviewPreviewResponse|null>(null);
  const [scriptReviewPreviewBusy, setScriptReviewPreviewBusy] = useState(false);
  const [scriptReviewPersistConfirmed, setScriptReviewPersistConfirmed] = useState(false);
  const [scriptReviewPersistBusy, setScriptReviewPersistBusy] = useState(false);
  const [scriptReviewAcceptanceResult, setScriptReviewAcceptanceResult] = useState<ScriptReviewAcceptanceResponse|null>(null);
  const [preproductionGate, setPreproductionGate] = useState<PreproductionGateStatus>({ status:"loading", ready:false, blockers:["status_not_loaded"], outputFingerprint:null, plannedSourceLockFingerprint:null, sourceLockBound:false, persistedReviewAccepted:false, planningAllowed:false, authorizationRequired:true, runtimeVerification:"not_run", executionAllowed:false, characterGenerationTriggered:false, storyboardGenerationTriggered:false, localMiniDramaCalls:0, lumenXCalls:0, modelCalls:0, databaseWrites:false, externalCalls:false, costIncurred:false, generatedMedia:false, publishTriggered:false, businessResult:false });
  const [scriptProvider, setScriptProvider] = useState("");
  const [scriptTextModel, setScriptTextModel] = useState("");
  const [scriptCost, setScriptCost] = useState("");
  const [scriptMaxCost, setScriptMaxCost] = useState("");
  const [scriptPricingConfirmed, setScriptPricingConfirmed] = useState(false);
  const [scriptConsent, setScriptConsent] = useState(false);
  const [scriptPreview, setScriptPreview] = useState<ScriptApprovalPreview|null>(null);
  const [scriptApprovalFingerprint, setScriptApprovalFingerprint] = useState<{configKey:string;hash:string}|null>(null);
  const [scriptPreviewBusy, setScriptPreviewBusy] = useState(false);
  const evidencePipelineRevision = useRef(0);
  const manualSourceNameSuggestions = useMemo(() => listManualSourceNameSuggestions(newsSourceCatalog.sources), [newsSourceCatalog.sources]);
  const manualSourceLinkHostHint = useMemo(() => describeManualSourceLinkHost(manualEvidenceDraft.sourceName, manualEvidenceDraft.canonicalUrl, manualSourceNameSuggestions), [manualEvidenceDraft.sourceName, manualEvidenceDraft.canonicalUrl, manualSourceNameSuggestions]);

  const clearSourceLockSavePreviews = () => {
    setSourceLockSavePlan(null);
    setSourceLockSaveAuthorizationPreview(null);
    evidencePipelineRevision.current += 1;
  };
  const updateManualEvidenceDraft = <K extends keyof ManualEvidenceDraft,>(field:K, value:ManualEvidenceDraft[K]) => {
    setManualEvidenceDraft((current) => ({ ...current, [field]:value }));
    setManualEvidencePreview(null);
    setEvidenceReviewDecisions({});
    setEvidenceReviewPreview(null);
    clearSourceLockSavePreviews();
  };

  const load = async () => {
    try {
      const [i,a,j,m] = await Promise.all([fetch("/api/ideas"), fetch("/api/accounts"), fetch("/api/jobs"), fetch("/api/metrics")]);
      if (![i,a,j].every((response) => response.ok)) throw new Error("数据服务尚未初始化");
      const metricPayload = await m.json() as MetricFeedStatus & {metrics:Metric[]};
      setIdeas((await i.json()).ideas); setAccounts((await a.json()).accounts); setJobs((await j.json()).jobs); setMetrics(metricPayload.metrics ?? []); setMetricFeedStatus(metricPayload);
      setMessage("准备就绪：先从10个候选中选出最多3个。 ");
    } catch { setMessage("当前使用本机候选池；私有线上版会自动保存选择与数据。"); }
  };

  const loadNewsPreview = async () => {
    setNewsPreviewBusy(true);
    try {
      const response = await fetch("/api/news/preview", { cache:"no-store" });
      const payload = await response.json() as NewsPreviewStatus;
      setNewsPreview(payload);
    } catch {
      setMessage("公开 RSS 预览失败；没有写入数据库，也没有生成新闻结论。");
    } finally {
      setNewsPreviewBusy(false);
    }
  };

  const loadTopicClusters = async () => {
    setTopicClustersBusy(true);
    try {
      const response = await fetch("/api/news/clusters", { cache:"no-store" });
      setTopicClusters(await response.json() as TopicClusterPreview);
    } catch {
      setMessage("跨来源聚类失败；没有写入数据库，也没有生成热度结论。");
    } finally {
      setTopicClustersBusy(false);
    }
  };
  const loadTopicRanking = async () => {
    setTopicRankingBusy(true);
    try {
      const response = await fetch("/api/news/ranked-candidates", { cache:"no-store" });
      const payload = await response.json() as TopicRankingPreview;
      setTopicRanking(payload);
      if (payload.evidenceGapFallback) {
        setEvidenceGaps(payload.evidenceGapFallback);
        setEvidenceGapShortlist([]);
        setEvidenceSearchPlan(null);
        setEvidenceMetadataPreview(null);
        setEvidenceReviewDecisions({});
        setEvidenceReviewPreview(null);
        clearSourceLockSavePreviews();
      }
    } catch {
      setMessage("候选评分失败；没有生成播放量预测、写入数据库或解锁草稿。");
    } finally {
      setTopicRankingBusy(false);
    }
  };
  const loadEvidenceGaps = async () => {
    setEvidenceGapsBusy(true);
    try {
      const response = await fetch("/api/news/evidence-gaps", { cache:"no-store" });
      setEvidenceGaps(await response.json() as EvidenceGapPreview);
      setEvidenceGapShortlist([]);
      setEvidenceSearchPlan(null);
      setEvidenceMetadataPreview(null);
      setManualEvidencePreview(null);
      setEvidenceReviewDecisions({});
      setEvidenceReviewPreview(null);
      clearSourceLockSavePreviews();
    } catch {
      setMessage("补证清单生成失败；没有自动搜索、保存选择、写入数据库或解锁草稿。");
    } finally {
      setEvidenceGapsBusy(false);
    }
  };
  const toggleEvidenceGap = (id:string) => {
    setEvidenceSearchPlan(null);
    setEvidenceMetadataPreview(null);
    setManualEvidencePreview(null);
    setEvidenceReviewDecisions({});
    setEvidenceReviewPreview(null);
    clearSourceLockSavePreviews();
    setEvidenceGapShortlist((current) => current.includes(id) ? current.filter((candidateId) => candidateId !== id) : current.length < 3 ? [...current, id] : current);
  };
  const previewEvidenceSearchPlan = async () => {
    setEvidenceSearchPlanBusy(true);
    setEvidenceMetadataPreview(null);
    setManualEvidencePreview(null);
    setEvidenceReviewDecisions({});
    setEvidenceReviewPreview(null);
    clearSourceLockSavePreviews();
    const requestRevision = evidencePipelineRevision.current;
    try {
      const response = await fetch("/api/news/evidence-search-plan", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ selectedIds:evidenceGapShortlist }) });
      const plan = await response.json() as EvidenceSearchPlanPreview;
      if (requestRevision !== evidencePipelineRevision.current) return;
      setEvidenceSearchPlan(plan);
    } catch {
      if (requestRevision === evidencePipelineRevision.current) setMessage("第二来源检索计划生成失败；没有执行搜索、创建来源锁或写入数据库。");
    } finally {
      setEvidenceSearchPlanBusy(false);
    }
  };
  const previewEvidenceMetadata = async () => {
    setEvidenceMetadataBusy(true);
    setEvidenceReviewDecisions({});
    setEvidenceReviewPreview(null);
    clearSourceLockSavePreviews();
    const requestRevision = evidencePipelineRevision.current;
    try {
      const response = await fetch("/api/news/evidence-metadata-preview", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ selectedIds:evidenceGapShortlist }) });
      const preview = await response.json() as EvidenceMetadataPreview;
      if (requestRevision !== evidencePipelineRevision.current) return;
      setEvidenceMetadataPreview(preview);
    } catch {
      if (requestRevision === evidencePipelineRevision.current) setMessage("公开 RSS 元数据检索失败；没有读取文章正文、核验事实、创建来源锁或写入数据库。");
    } finally {
      setEvidenceMetadataBusy(false);
    }
  };
  const previewManualEvidence = async () => {
    setManualEvidenceBusy(true);
    setManualEvidencePreview(null);
    setEvidenceReviewDecisions({});
    setEvidenceReviewPreview(null);
    clearSourceLockSavePreviews();
    const requestRevision = evidencePipelineRevision.current;
    try {
      const response = await fetch("/api/news/manual-evidence-preview", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ selectedIds:evidenceGapShortlist, inputs:[manualEvidenceDraft] }) });
      const preview = await response.json() as ManualEvidencePreview;
      if (requestRevision !== evidencePipelineRevision.current) return;
      setManualEvidencePreview(preview);
    } catch {
      if (requestRevision === evidencePipelineRevision.current) setMessage("人工公开来源预览失败；没有请求候选链接、保存输入、创建来源锁或写入数据库。");
    } finally {
      setManualEvidenceBusy(false);
    }
  };
  const selectEvidenceCandidate = (leadId:string, candidateId:string) => {
    setEvidenceReviewPreview(null);
    clearSourceLockSavePreviews();
    setEvidenceReviewDecisions((current) => ({ ...current, [leadId]: { candidateId, candidateMode:"rss_metadata", checks:Object.fromEntries(evidenceReviewChecklist.map(({id})=>[id,false])) as Record<EvidenceReviewCheckId,boolean> } }));
  };
  const selectManualEvidenceCandidate = (leadId:string, candidateId:string) => {
    setEvidenceReviewPreview(null);
    clearSourceLockSavePreviews();
    setEvidenceReviewDecisions({ [leadId]: { candidateId, candidateMode:"manual_public_metadata", checks:Object.fromEntries(evidenceReviewChecklist.map(({id})=>[id,false])) as Record<EvidenceReviewCheckId,boolean> } });
  };
  const toggleEvidenceReviewCheck = (leadId:string, checkId:EvidenceReviewCheckId) => {
    setEvidenceReviewPreview(null);
    clearSourceLockSavePreviews();
    setEvidenceReviewDecisions((current) => current[leadId] ? ({ ...current, [leadId]: { ...current[leadId], checks:{ ...current[leadId].checks, [checkId]:!current[leadId].checks[checkId] } } }) : current);
  };
  const previewEvidenceReview = async () => {
    setEvidenceReviewBusy(true);
    setEvidenceReviewPreview(null);
    clearSourceLockSavePreviews();
    const requestRevision = evidencePipelineRevision.current;
    try {
      const decisions = Object.entries(evidenceReviewDecisions).map(([leadId,decision])=>({leadId,candidateId:decision.candidateId,checks:decision.checks}));
      const manualInputs = Object.values(evidenceReviewDecisions).some((decision)=>decision.candidateMode==="manual_public_metadata") ? [manualEvidenceDraft] : [];
      const response = await fetch("/api/news/evidence-review-preview", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ selectedIds:evidenceGapShortlist, decisions, manualInputs }) });
      const preview = await response.json() as EvidenceReviewPreview;
      if (requestRevision !== evidencePipelineRevision.current) return;
      setEvidenceReviewPreview(preview);
    } catch {
      if (requestRevision === evidencePipelineRevision.current) setMessage("证据审查预览失败；没有保存审查、创建来源锁、写入数据库或生成草稿。");
    } finally {
      setEvidenceReviewBusy(false);
    }
  };
  const previewSourceLockSavePlan = async () => {
    if (!evidenceReviewPreview?.reviewFingerprint) return;
    setSourceLockSavePlanBusy(true);
    setSourceLockSavePlan(null);
    setSourceLockSaveAuthorizationPreview(null);
    evidencePipelineRevision.current += 1;
    const requestRevision = evidencePipelineRevision.current;
    try {
      const decisions = Object.entries(evidenceReviewDecisions).map(([leadId,decision])=>({leadId,candidateId:decision.candidateId,checks:decision.checks}));
      const manualInputs = Object.values(evidenceReviewDecisions).some((decision)=>decision.candidateMode==="manual_public_metadata") ? [manualEvidenceDraft] : [];
      const response = await fetch("/api/news/source-lock-save-plan", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ selectedIds:evidenceGapShortlist, decisions, manualInputs, confirmedReviewFingerprint:evidenceReviewPreview.reviewFingerprint }) });
      const plan = await response.json() as SourceLockSavePlan;
      if (requestRevision !== evidencePipelineRevision.current) return;
      setSourceLockSavePlan(plan);
    } catch {
      if (requestRevision === evidencePipelineRevision.current) setMessage("来源锁保存计划生成失败；没有授予授权、写入数据库、创建来源锁或生成草稿。");
    } finally {
      setSourceLockSavePlanBusy(false);
    }
  };
  const previewSourceLockSaveAuthorization = async () => {
    if (!sourceLockSavePlan?.readyForAuthorizationRequest) return;
    setSourceLockSaveAuthorizationPreviewBusy(true);
    setSourceLockSaveAuthorizationPreview(null);
    evidencePipelineRevision.current += 1;
    const requestRevision = evidencePipelineRevision.current;
    try {
      const response = await fetch("/api/news/source-lock-save-authorization-preview", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ savePlan:sourceLockSavePlan }) });
      const preview = await response.json() as SourceLockSaveAuthorizationPreview;
      if (requestRevision !== evidencePipelineRevision.current) return;
      setSourceLockSaveAuthorizationPreview(preview);
    } catch {
      if (requestRevision === evidencePipelineRevision.current) setMessage("来源锁保存授权预览失败；没有授予授权、写入数据库、创建来源锁或生成草稿。");
    } finally {
      setSourceLockSaveAuthorizationPreviewBusy(false);
    }
  };
  useEffect(() => {
    // All state updates in load happen after its network requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    fetch("/api/local/health")
      .then(async (response) => ({ response, payload: await response.json() }))
      .then(async ({ response, payload }) => {
        const ready = response.ok && payload.ready;
        setLocalEngine({ ...payload, ready });
        if (ready) {
          const [projectsResponse, preflightResponse, readinessResponse, enginesResponse, executionResponse, migrationResponse, bridgeStatusResponse, runtimeStatusResponse, metricsMigrationResponse, migrationChainResponse, isolatedChainResponse, scriptPlanResponse] = await Promise.all([fetch("/api/local/projects"), fetch("/api/local/preflight"), fetch("/api/local/readiness"), fetch("/api/local/engines"), fetch("/api/local/pilot-execution"), fetch("/api/local/receipt-migration"), fetch("/api/local/bridge-status"), fetch("/api/local/runtime-status"), fetch("/api/local/metrics-migration"), fetch("/api/local/migration-chain"), fetch("/api/local/migration-chain-verification"), fetch("/api/local/script-plan")]);
          if (projectsResponse.ok) setLocalProjects((await projectsResponse.json()).projects ?? []);
          if (preflightResponse.ok) setPreflight(await preflightResponse.json());
          const readinessPayload = await readinessResponse.json() as PackageReadinessWithAdapter;
          setPackageReadiness(readinessPayload);
          if (enginesResponse.ok) setLocalEngineRows((await enginesResponse.json()).engines ?? []);
          if (executionResponse.ok) setExecutionPreparation(await executionResponse.json());
          if (migrationResponse.ok) setReceiptMigration(await migrationResponse.json());
          if (bridgeStatusResponse.ok) setBridgeStatus(await bridgeStatusResponse.json());
          if (runtimeStatusResponse.ok) setRuntimeStatus(await runtimeStatusResponse.json());
          if (metricsMigrationResponse.ok) setMetricsMigration(await metricsMigrationResponse.json());
          if (migrationChainResponse.ok) setMigrationChain(await migrationChainResponse.json());
          if (isolatedChainResponse.ok) setIsolatedChain(await isolatedChainResponse.json());
          if (scriptPlanResponse.ok) setScriptPlan(await scriptPlanResponse.json());
        } else {
          setPreflight({ ready:false, mode:"cloud", stages:[], message:"请启动本机操作台后查看模型检查结果。" });
        }
      })
      .catch(() => setLocalEngine({ ready:false, mode:"local", message:"本机引擎未启动" }));
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/news/sources", { cache:"no-store" })
      .then(async (response) => ({ response, payload: await response.json() as NewsSourceCatalogStatus }))
      .then(({ response, payload }) => {
        if (active) setNewsSourceCatalog(response.ok ? payload : { ...payload, status:"catalog_blocked" });
      })
      .catch(() => {
        if (active) setNewsSourceCatalog((catalog) => ({ ...catalog, status:"unavailable" }));
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/local/social-draft-handoff?project=octopus-pilot", { cache:"no-store" })
      .then(async (response) => ({ response, payload: await response.json() as SocialDraftHandoffStatus }))
      .then(({ response, payload }) => {
        if (active && response.ok) setSocialDraftHandoff(payload);
      })
      .catch(() => {
        if (active) setSocialDraftHandoff((status) => ({ ...status, status:"unavailable" }));
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/local/script-acceptance", { cache:"no-store" }),
      fetch("/api/local/preproduction-gate", { cache:"no-store" }),
    ])
      .then(async ([acceptanceResponse, gateResponse]) => ({
        acceptanceResponse,
        gateResponse,
        acceptancePayload: await acceptanceResponse.json() as ScriptAcceptanceStatus,
        gatePayload: await gateResponse.json() as PreproductionGateStatus,
      }))
      .then(({ acceptanceResponse, gateResponse, acceptancePayload, gatePayload }) => {
        if (!active) return;
        if (acceptanceResponse.ok) setScriptAcceptance(acceptancePayload);
        if (gateResponse.ok) setPreproductionGate(gatePayload);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const selected = ideas.filter((idea) => idea.selected);
  const reviewTarget = jobs.find((job) => job.status === "review_pending") ?? jobs.find((job) => job.status === "approved_for_manual_publish") ?? jobs[0];
  const reviewComplete = reviewChecklist.every(({ id }) => reviewChecks[id]);
  const reviewReady = reviewTarget?.status === "review_pending";
  const reviewTargetId = reviewTarget?.id;
  useEffect(() => {
    if (view !== "review" || !reviewTargetId) return;
    let active = true;
    fetch(`/api/reviews?jobId=${encodeURIComponent(reviewTargetId)}`)
      .then(async (response) => ({ response, payload: await response.json() as { audits?:ReviewAudit[]; error?:string } }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok) {
          setReviewAudits([]);
          setReviewHistoryStatus(payload.error || "审核历史读取失败");
          return;
        }
        setReviewAudits(payload.audits ?? []);
        setReviewHistoryStatus(payload.audits?.length ? "" : "暂无审核记录");
      })
      .catch(() => {
        if (!active) return;
        setReviewAudits([]);
        setReviewHistoryStatus("审核历史读取失败");
      });
    return () => { active = false; };
  }, [view, reviewTargetId]);
  const totalViews = metrics.reduce((sum, item) => sum + item.views, 0);
  const avgCompletion = metrics.length ? Math.round(metrics.reduce((sum, item) => sum + item.completionRate, 0) / metrics.length) : 0;
  const platformAverages = useMemo(() => Object.keys(platformMeta).map((key) => {
    const rows = metrics.filter((metric) => metric.platform === key);
    return { key, views: rows.length ? Math.round(rows.reduce((sum,row)=>sum+row.views,0)/rows.length) : 0 };
  }), [metrics]);

  const toggleIdea = async (idea: Idea) => {
    if (!idea.selected && selected.length >= 3) { setMessage("一次最多选择3个，先取消一个再选。"); return; }
    const next = !idea.selected;
    setIdeas((rows) => rows.map((row) => row.id === idea.id ? { ...row, selected: next } : row));
    const response = await fetch("/api/ideas", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:idea.id, selected:next }) });
    if (!response.ok) setMessage("当前为本地预览，选择已在页面保留但尚未写入云端。");
  };

  const queueGeneration = async () => {
    if (!selected.length) { setMessage("请先选择至少1个选题。"); return; }
    if (!platforms.length) { setMessage("请至少选择1个平台版本。"); return; }
    setBusy(true);
    setMessage(localEngine.ready ? "正在把选题交给本机漫剧引擎…" : "正在保存选题和三平台生产任务…");

    let cloudQueued = false;
    try {
      const response = await fetch("/api/jobs", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ideaIds:selected.map((i)=>i.id), platforms }) });
      cloudQueued = response.ok;
    } catch { cloudQueued = false; }

    if (localEngine.ready) {
      try {
        const results = await Promise.all(selected.map(async (idea) => {
          const response = await fetch("/api/local/generate", {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({ ...idea, platforms }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || `${idea.title} 创建失败`);
          return { ...payload.project, projectUrl:payload.projectUrl, storyTaskId:payload.storyTaskId, nextAction:payload.nextAction } as LocalProject;
        }));
        setLocalProjects((rows) => [...results, ...rows]);
        const generating = results.filter((item) => item.nextAction === "story_generating").length;
        setMessage(generating
          ? `已创建 ${results.length} 个真实漫剧项目，其中 ${generating} 个正在生成剧本。`
          : `已创建 ${results.length} 个真实漫剧项目。现在只差配置一个文本模型，才能自动写剧本。`);
        if (cloudQueued) await load();
        setView("production");
      } catch (error) {
        setMessage(error instanceof Error ? `本机引擎返回：${error.message}` : "本机项目创建失败。");
      }
    } else if (cloudQueued) {
      setMessage(`已保存 ${selected.length} 个生产任务。双击“启动知绘工厂”后，可在本机真正创建项目。`);
      await load();
      setView("production");
    } else {
      setMessage("暂时无法创建任务：请先启动本机操作台。 ");
    }
    setBusy(false);
  };

  const togglePlatform = (key:string) => setPlatforms((rows) => rows.includes(key) ? rows.filter((row)=>row!==key) : [...rows,key]);

  const syncLocalArtifacts = async () => {
    setSyncBusy(true);
    try {
      const response = await fetch("/api/local/readiness", { method:"POST" });
      const payload = await response.json() as PackageReadinessWithAdapter;
      if (!response.ok) throw new Error(payload.error || "真实产物同步失败");
      setPackageReadiness(payload);
      const registered = payload.sync?.registered.map((artifact) => artifact.kind).join("、") || "无新增产物";
      const missing = payload.sync?.missingKinds.join("、") || "无";
      setMessage(payload.sync?.changed ? `已登记真实产物：${registered}；仍缺少：${missing}。` : `没有发现新产物；仍缺少：${missing}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "真实产物同步失败");
    } finally {
      setSyncBusy(false);
    }
  };

  const recordReview = async () => {
    if (!reviewTarget || !reviewReady || !reviewComplete) return;
    setReviewBusy(true);
    try {
      const response = await fetch("/api/jobs", {
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ action:"approve_for_manual_publish", jobId:reviewTarget.id, checks:reviewChecks }),
      });
      const payload = await response.json() as { job?:Job; reviewAudit?:ReviewAudit; error?:string };
      if (!response.ok || !payload.job) throw new Error(payload.error || "审核记录保存失败");
      setJobs((rows) => rows.map((job) => job.id === payload.job?.id ? payload.job : job));
      if (payload.reviewAudit) setReviewAudits((rows) => [payload.reviewAudit as ReviewAudit, ...rows]);
      setReviewHistoryStatus("");
      setReviewChecks(Object.fromEntries(reviewChecklist.map(({ id }) => [id, false])) as Record<ReviewCheckId, boolean>);
      setMessage("人工审核已记录；系统没有发布内容，仍需账号本人执行平台授权操作。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "审核记录保存失败");
    } finally {
      setReviewBusy(false);
    }
  };

  const previewPilotApproval = async () => {
    const approval = packageReadiness.generationPlan?.pilotApproval;
    if (!approval) { setMessage("当前没有可预览的首个分镜。"); return; }
    const configKey = JSON.stringify([approval.requestHash, pilotProvider, pilotImageModel, pilotVideoModel, pilotImageCost, pilotVideoCost, pilotPricingConfirmed, pilotMaxCost]);
    setPilotPreviewBusy(true);
    try {
      const response = await fetch("/api/local/pilot-approval", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          provider:pilotProvider || null,
          imageModel:pilotImageModel || null,
          videoModel:pilotVideoModel || null,
          imageCostCny:pilotImageCost ? Number(pilotImageCost) : null,
          videoCostCny:pilotVideoCost ? Number(pilotVideoCost) : null,
          pricingConfirmed:pilotPricingConfirmed,
          maxCostCny:pilotMaxCost ? Number(pilotMaxCost) : null,
          approvedRequestHash:pilotConsent && pilotApprovalReceipt?.configKey === configKey ? pilotApprovalReceipt.hash : null,
          userApproved:pilotConsent,
        }),
      });
      const payload = await response.json() as PilotApprovalPreview;
      if (!response.ok) throw new Error(payload.error || "授权预览失败");
      setPilotPreview(payload);
      if (payload.gate.executionRequestHash) setPilotApprovalReceipt({ configKey, hash:payload.gate.executionRequestHash });
      setMessage(pilotConsent && payload.gate.blockers.includes("request_fingerprint_mismatch") ? "执行授权指纹已生成；请核对后再次生成预览。" : "授权预览已生成；没有执行模型、没有产生费用。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "授权预览失败");
    } finally {
      setPilotPreviewBusy(false);
    }
  };

  const previewScriptApproval = async () => {
    const configKey = JSON.stringify([scriptPlan.sourceLockFingerprint, scriptProvider, scriptTextModel, scriptCost, scriptMaxCost, scriptPricingConfirmed]);
    setScriptPreviewBusy(true);
    try {
      const response = await fetch("/api/local/script-approval", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          provider:scriptProvider || null,
          textModel:scriptTextModel || null,
          quotedCostCny:scriptCost === "" ? null : Number(scriptCost),
          pricingConfirmed:scriptPricingConfirmed,
          maxCostCny:scriptMaxCost === "" ? null : Number(scriptMaxCost),
          approvedRequestHash:scriptApprovalFingerprint?.configKey === configKey ? scriptApprovalFingerprint.hash : null,
          userApproved:scriptConsent,
        }),
      });
      const payload = await response.json() as ScriptApprovalPreview;
      if (!response.ok) throw new Error(payload.error || "剧本授权预览失败");
      setScriptPreview(payload);
      if (payload.gate.executionRequestHash) setScriptApprovalFingerprint({ configKey, hash:payload.gate.executionRequestHash });
      setMessage(payload.gate.eligible ? "剧本授权条件已通过预览；真实执行仍保持关闭。" : "剧本授权预览已更新；请处理仍未满足的条件。" );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "剧本授权预览失败");
    } finally {
      setScriptPreviewBusy(false);
    }
  };

  const refreshConnectionStatus = async () => {
    setConnectionRefreshBusy(true);
    try {
      const [enginesResponse, preflightResponse, readinessResponse, executionResponse, migrationResponse, bridgeStatusResponse, runtimeStatusResponse, scriptPlanResponse] = await Promise.all([
        fetch("/api/local/engines", { cache:"no-store" }),
        fetch("/api/local/preflight", { cache:"no-store" }),
        fetch("/api/local/readiness", { cache:"no-store" }),
        fetch("/api/local/pilot-execution", { cache:"no-store" }),
        fetch("/api/local/receipt-migration", { cache:"no-store" }),
        fetch("/api/local/bridge-status", { cache:"no-store" }),
        fetch("/api/local/runtime-status", { cache:"no-store" }),
        fetch("/api/local/script-plan", { cache:"no-store" }),
      ]);
      if (![enginesResponse, preflightResponse, readinessResponse, executionResponse, migrationResponse, bridgeStatusResponse, runtimeStatusResponse, scriptPlanResponse].every((response) => response.ok)) throw new Error("本机连接诊断暂不可用");
      const [enginesPayload, preflightPayload, readinessPayload, executionPayload, migrationPayload, bridgeStatusPayload, runtimeStatusPayload, scriptPlanPayload] = await Promise.all([
        enginesResponse.json() as Promise<{engines?:LocalEngineStatus[]}>,
        preflightResponse.json() as Promise<Preflight>,
        readinessResponse.json() as Promise<PackageReadiness>,
        executionResponse.json() as Promise<ExecutionPreparationStatus>,
        migrationResponse.json() as Promise<ReceiptMigrationReadiness>,
        bridgeStatusResponse.json() as Promise<BridgeStatus>,
        runtimeStatusResponse.json() as Promise<LocalRuntimeStatus>,
        scriptPlanResponse.json() as Promise<SourceLockedScriptPlan>,
      ]);
      setLocalEngineRows(enginesPayload.engines ?? []);
      setPreflight(preflightPayload);
      setPackageReadiness(readinessPayload);
      setExecutionPreparation(executionPayload);
      setReceiptMigration(migrationPayload);
      setBridgeStatus(bridgeStatusPayload);
      setRuntimeStatus(runtimeStatusPayload);
      setScriptPlan(scriptPlanPayload);
      const scriptAcceptanceResponse = await fetch("/api/local/script-acceptance", { cache:"no-store" });
      if (scriptAcceptanceResponse.ok) setScriptAcceptance(await scriptAcceptanceResponse.json() as ScriptAcceptanceStatus);
      const preproductionGateResponse = await fetch("/api/local/preproduction-gate", { cache:"no-store" });
      if (preproductionGateResponse.ok) setPreproductionGate(await preproductionGateResponse.json() as PreproductionGateStatus);
      setPilotPreview(null);
      setMessage("本机连接状态已刷新；没有测试密钥、调用模型或产生费用。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "本机连接诊断暂不可用");
    } finally {
      setConnectionRefreshBusy(false);
    }
  };

  const lumenX = localEngineRows.find((row) => row.id === "lumenx");
  const museTalk = localEngineRows.find((row) => row.id === "musetalk");
  const moneyPrinter = localEngineRows.find((row) => row.id === "moneyprinter") as (LocalEngineStatus & { contentPreflight?:MoneyPrinterPreflight }) | undefined;
  const lumenXCredentialDetected = lumenX?.configuration?.configuredKeyNames.includes("DASHSCOPE_API_KEY") ?? false;
  const lumenXVerificationRun = lumenX?.configuration?.verification !== "not_run";
  const activeScriptFingerprint = scriptAcceptance.reviewDraft?.outputFingerprint ?? null;
  const activeScriptReviewChecks = scriptReviewSession.outputFingerprint === activeScriptFingerprint ? scriptReviewSession.checks : {};
  const activeScriptReviewCount = scriptAcceptance.reviewDraft?.checks.filter((check) => activeScriptReviewChecks[check.id] === true).length ?? 0;
  const scriptReviewPreviewIsCurrent = scriptReviewPreview?.current.outputFingerprint === activeScriptFingerprint;
  const updateScriptReviewCheck = (id:string, confirmed:boolean) => {
    if (!activeScriptFingerprint) return;
    setScriptReviewSession((session) => ({
      outputFingerprint:activeScriptFingerprint,
      checks:{ ...(session.outputFingerprint === activeScriptFingerprint ? session.checks : {}), [id]:confirmed },
    }));
    setScriptReviewPreview(null);
    setScriptReviewPersistConfirmed(false);
    setScriptReviewAcceptanceResult(null);
  };
  const previewScriptReview = async () => {
    if (!scriptAcceptance.reviewDraft) return;
    setScriptReviewPreviewBusy(true);
    try {
      const response = await fetch("/api/local/script-review-preview", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          outputFingerprint:scriptAcceptance.reviewDraft.outputFingerprint,
          plannedSourceLockFingerprint:scriptAcceptance.reviewDraft.plannedSourceLockFingerprint,
          reviewDraftFingerprint:scriptAcceptance.reviewDraft.reviewDraftFingerprint,
          checks:activeScriptReviewChecks,
          confirmCurrentFingerprints:scriptReviewFingerprintConfirmed,
        }),
      });
      const payload = await response.json() as ScriptReviewPreviewResponse;
      if (!response.ok) throw new Error(payload.error || "剧本复核预览失败");
      setScriptReviewPreview(payload);
      setScriptReviewPersistConfirmed(false);
      setScriptReviewAcceptanceResult(null);
      setMessage(payload.preview.previewComplete ? "复核输入完整，但结论尚未保存，分镜仍保持锁定。" : "复核预览已更新；请处理尚未满足的条件。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "剧本复核预览失败");
    } finally {
      setScriptReviewPreviewBusy(false);
    }
  };
  const persistScriptReview = async () => {
    if (!scriptAcceptance.reviewDraft || !scriptReviewPreview?.preview.previewComplete || !scriptReviewPreview.preview.previewFingerprint) return;
    setScriptReviewPersistBusy(true);
    try {
      const response = await fetch("/api/local/script-review-acceptance", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          outputFingerprint:scriptAcceptance.reviewDraft.outputFingerprint,
          plannedSourceLockFingerprint:scriptAcceptance.reviewDraft.plannedSourceLockFingerprint,
          reviewDraftFingerprint:scriptAcceptance.reviewDraft.reviewDraftFingerprint,
          checks:activeScriptReviewChecks,
          confirmCurrentFingerprints:scriptReviewFingerprintConfirmed,
          previewFingerprint:scriptReviewPreview.preview.previewFingerprint,
          confirmPersistedAcceptance:scriptReviewPersistConfirmed,
        }),
      });
      const payload = await response.json() as ScriptReviewAcceptanceResponse;
      setScriptReviewAcceptanceResult(payload);
      if (!response.ok) throw new Error(payload.migrationRequired ? `验收存储尚未初始化，需要迁移 ${payload.migrationRequired}` : payload.error || "剧本验收记录保存失败");
      const gateResponse = await fetch("/api/local/preproduction-gate", { cache:"no-store" });
      if (gateResponse.ok) setPreproductionGate(await gateResponse.json() as PreproductionGateStatus);
      setMessage("人工剧本验收记录已持久化；角色与分镜仅解除规划锁，模型执行仍关闭。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "剧本验收记录保存失败");
    } finally {
      setScriptReviewPersistBusy(false);
    }
  };

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span>知</span><div><b>知绘工厂</b><small>CONTENT OS</small></div></div>
      <nav>
        {[ ["ideas","热点雷达","10"], ["production","草稿工坊",String(jobs.length)], ["review","审核交接",jobs.length ? "!" : "0"], ["metrics","增长学习",String(metrics.length)], ["accounts","来源与账号","5"] ].map(([id,label,count]) =>
          <button key={id} className={view===id?"active":""} onClick={()=>setView(id)}><i>{label}</i><span>{count}</span></button>)}
      </nav>
      <div className="sidebarFoot"><span className={localEngine.ready?"pulse online":"pulse"}/> {localEngine.ready?"本机生成引擎在线":"当前为云端规划模式"}<small>RTX 4060 · 8GB VRAM</small></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><p>AI · TECH · FINANCE INTELLIGENCE DESK</p><h1>{view==="ideas"?"今天什么值得写？":view==="production"?"草稿做到哪了？":view==="review"?"审核后再发布":view==="metrics"?"让真实数据教会系统":"把来源和账号接起来"}</h1></div><div className="today"><span>增长实验第 01 天</span><b>目标 10 万粉</b></div></header>
      <div className="notice"><span>●</span>{message}</div>

      {view === "ideas" && <>
        <section className="intelBrief">
          <div><small>TODAY&apos;S INTELLIGENCE</small><h2>热点不是一条新闻，是多个可信来源的交集。</h2><p>已登记 {newsSourceCatalog.summary.totalSources || "—"} 个信源，其中 {newsSourceCatalog.summary.enabledSources || "—"} 个公开来源可进入后续采集；当前只是目录，真实抓取仍为 0。原文时间、事实主张和争议点必须随草稿一起交付。</p></div>
          <ol><li><b>01</b><span>公开来源聚合</span><em>RSS · 官方新闻室 · 监管文件</em></li><li><b>02</b><span>聚类与风险检查</span><em>去重 · 交叉来源 · 时效</em></li><li><b>03</b><span>生成平台草稿</span><em>小红书 · 抖音图文 · 人工发送</em></li></ol>
        </section>
        <section className="newsPreview">
          <header><div><small>LIVE RSS · READ ONLY</small><b>{newsPreview?`真实条目 ${newsPreview.summary.itemsReturned} · 可用信源 ${newsPreview.summary.readySources}/${newsPreview.summary.feedsAttempted}`:"尚未读取实时 RSS"}</b></div><button type="button" disabled={newsPreviewBusy} onClick={loadNewsPreview}>{newsPreviewBusy?"读取中…":"读取公开 RSS（只读）"}</button></header>
          {newsPreview?.items.length ? <div>{newsPreview.items.slice(0,6).map((item)=><a href={item.canonicalUrl} target="_blank" rel="noreferrer" key={item.id}><small>{item.sourceName} · {item.publishedAt?new Date(item.publishedAt).toLocaleString("zh-CN"):"时间未提供"}</small><b>{item.title}</b>{item.summary&&<span>{item.summary}</span>}</a>)}</div> : <p>{newsPreview?"本次没有解析出可展示的真实条目；查看信源健康状态后再处理。":"点击后只读取已登记的公开 RSS；不会写数据库，不会把标题自动当成已核验事实。"}</p>}
          {newsPreview&&<p>链路判断：{rssTransportLabels[newsPreview.transportAssessment.status]} · TLS/代理类失败 {newsPreview.transportAssessment.tlsOrProxyFailures} · 全局断网证据 {newsPreview.transportAssessment.globalOutageProven?"已建立":"未建立"}</p>}
          {newsPreview&&<aside>{newsPreview.sourceHealth.map((source)=><span className={source.status} key={source.sourceId}><i>{source.status==="ready"?"✓":source.status==="empty"?"—":"!"}</i>{source.sourceId}<em>{source.status==="ready"?`${source.itemsParsed} 条`:`${source.errorCode??"无条目"}${source.operatorAction?` · ${rssOperatorActionLabels[source.operatorAction]??source.operatorAction}`:""}`}</em></span>)}</aside>}
          <footer>事实核验 {newsPreview?.factsVerified?"已完成":"未完成"} · 外部请求 {newsPreview?.externalCalls??0} · 数据库写入 {newsPreview?.databaseWrites?"已发生":"0"} · 发布 {newsPreview?.publishTriggered?"已触发":"0"}</footer>
        </section>
        <section className="topicClusters">
          <header><div><small>TOPIC CLUSTERS · ALGORITHM ONLY</small><b>{topicClusters?`${topicClusters.summary.clusterCount} 个聚类 · ${topicClusters.summary.eligibleCandidates} 个多源候选`:"等待跨来源聚类"}</b></div><button type="button" disabled={topicClustersBusy} onClick={loadTopicClusters}>{topicClustersBusy?"聚类中…":"生成跨来源聚类（只读）"}</button></header>
          {topicClusters?.clusters.length ? <div>{topicClusters.clusters.slice(0,6).map((cluster)=><article className={cluster.eligibleForHotspotScoring?"eligible":"single"} key={cluster.id}><small>{cluster.eligibleForHotspotScoring?"多源候选":"单源观察"} · {cluster.sourceCount} 来源 / {cluster.itemCount} 条</small><b>{cluster.title}</b><span>{cluster.sourceIds.join(" · ")}</span><em>{cluster.timeWindowVerified?"时间窗已核对":"时间窗未完整"} · 相似度 {cluster.meanSimilarity??"—"}</em></article>)}</div> : <p>{topicClusters?"当前真实条目没有形成可展示聚类。":"相似标题只形成候选组；至少两个独立来源且发布时间完整，才允许进入下一阶段评分。"}</p>}
          <footer>事实核验 {topicClusters?.factsVerified?"已完成":"未完成"} · 热度评分 {topicClusters?.heatScored?"已执行":"0"} · 外部请求 {topicClusters?.externalCalls??0} · 写库 {topicClusters?.databaseWrites?"已发生":"0"} · 发布 {topicClusters?.publishTriggered?"已触发":"0"}</footer>
        </section>
        <section className="topicRanking">
          <header><div><small>RELATIVE PRIORITY · RULES V1</small><b>{topicRanking?`${topicRanking.summary.rankedCandidates} 个已评分 · ${topicRanking.summary.blockedBeforeScoring} 个评分前拦截`:"等待合格多源候选"}</b></div><button type="button" disabled={topicRankingBusy} onClick={loadTopicRanking}>{topicRankingBusy?"计算中…":"计算相对优先级（只读）"}</button></header>
          {topicRanking?.candidates.length ? <div>{topicRanking.candidates.slice(0,6).map((candidate)=><article key={candidate.id}><strong>{candidate.relativePriorityScore}</strong><div><small>趋势证据 {candidate.trendEvidenceScore} · 账号匹配 {candidate.accountFitScore}</small><b>{candidate.title}</b><span>{candidate.sourceCount} 个来源 · {candidate.itemCount} 条证据 · 主题 {candidate.matchedAccountTopics.join(" / ")||"未命中"}</span></div></article>)}</div> : <p>{topicRanking?.evidenceGapFallback?.leads.length?`没有满足双来源门槛的候选；已复用本轮数据生成 ${topicRanking.evidenceGapFallback.leads.length} 条补证线索，等待你在下方人工选择。`:topicRanking?"当前没有满足多来源与完整时间窗的候选，因此不生成任何分数。":"分数只做相对排序；没有真实账号指标校准，不输出预计播放量或爆款概率。"}</p>}
          <footer>账号画像 {topicRanking?.profile.label??"AI / 科技 / 金融规则版"} · 分类覆盖 {topicRanking?`${topicRanking.profile.categoryCoverage.mappedCategories}/${topicRanking.profile.categoryCoverage.categoriesPresent}`:"待检查"} · 事实核验 {topicRanking?.factsVerified?"已完成":"未完成"} · 播放量预测 0 · 爆款概率 0 · 草稿解锁 {topicRanking?.humanSelectionUnlocked?"是":"否"} · 写库 {topicRanking?.databaseWrites?"已发生":"0"} · 发布 {topicRanking?.publishTriggered?"已触发":"0"}</footer>
        </section>
        <section className="evidenceGaps">
          <header><div><small>EVIDENCE GAP · HUMAN SHORTLIST</small><b>{evidenceGaps?`${evidenceGaps.summary.leadsReturned} 条补证线索 · ${evidenceGaps.summary.sourcesRepresented} 个来源 · 语言 ${evidenceGaps.summary.languagesRepresented.join(" / ")||"未识别"} · 已选 ${evidenceGapShortlist.length}/3`:"等待单来源线索分析"}</b></div><button type="button" disabled={evidenceGapsBusy} onClick={loadEvidenceGaps}>{evidenceGapsBusy?"分析中…":"生成补证清单（只读）"}</button></header>
          {evidenceGaps?.leads.length ? <div>{evidenceGaps.leads.slice(0,8).map((lead)=><article className={evidenceGapShortlist.includes(lead.id)?"selected":""} key={lead.id}><div><small>账号匹配 {lead.accountFitScore} · {lead.sourceId} · {lead.ageHours} 小时前 · 查询 {lead.queryLanguage}</small><b>{lead.title}</b><span>还缺 {lead.missingIndependentSources} 个独立来源 · 建议检索：{lead.suggestedQueries[1]??lead.suggestedQueries[0]}</span></div><button type="button" onClick={()=>toggleEvidenceGap(lead.id)}>{evidenceGapShortlist.includes(lead.id)?"移出清单":"加入补证"}</button></article>)}</div> : <p>{evidenceGaps?"当前没有同时满足七天时效和账号匹配门槛的单来源线索。":"这里只筛出值得继续找第二来源的线索；不会自动搜索，也不会把线索当成已核验选题。"}</p>}
          {evidenceGapShortlist.length>0&&<aside className="evidenceSearchPlan"><div><b>{evidenceSearchPlan?.readyForHumanResearchReview?"检索计划已生成，但尚未执行":`已选 ${evidenceGapShortlist.length} 条，等待生成计划`}</b><span>{evidenceSearchPlan?.readyForHumanResearchReview?`${evidenceSearchPlan.targets.length} 个目标 · RSS 元数据 ${evidenceSearchPlan.targets.reduce((sum,target)=>sum+target.allowedSourceSummary.rssMetadataSources,0)} 个 · 人工公开页 ${evidenceSearchPlan.targets.reduce((sum,target)=>sum+target.allowedSourceSummary.manualPublicPageSources,0)} 个 · 已排除 ${evidenceSearchPlan.targets.reduce((sum,target)=>sum+target.independenceDiagnostics.excludedSources.length,0)} 个同源入口`:`最多 3 条 · 只允许公开 RSS 与官方新闻室`}</span>{evidenceSearchPlan?.planFingerprint&&<code>{evidenceSearchPlan.planFingerprint.slice(0,16)}…</code>}</div><div className="evidencePlanActions"><button type="button" disabled={evidenceSearchPlanBusy} onClick={previewEvidenceSearchPlan}>{evidenceSearchPlanBusy?"核对中…":"生成第二来源检索计划（不执行）"}</button><button type="button" disabled={!evidenceSearchPlan?.readyForHumanResearchReview||evidenceMetadataBusy} onClick={previewEvidenceMetadata}>{evidenceMetadataBusy?"检索中…":"检索公开 RSS 元数据"}</button></div></aside>}
          {evidenceSearchPlan?.readyForHumanResearchReview&&<aside className="manualResearchLinks"><header><b>人工公开页直达入口</b><span>只在新标签页打开，不自动检索或读取正文</span></header>{evidenceSearchPlan.targets.map((target)=>{const sources=target.allowedSources.filter((source)=>source.collectionMode==="manual_public_page_review");return sources.length?<section key={target.leadId}><strong>{target.title}</strong><div>{sources.map((source)=><a key={source.id} href={source.baseUrl} target="_blank" rel="noreferrer">仅人工打开：{source.name}</a>)}</div></section>:null})}</aside>}
          {evidenceSearchPlan?.readyForHumanResearchReview&&<aside className="manualEvidenceForm"><header><b>人工公开来源预览（不保存）</b><span>当前仅支持一次审查 1 个标题；修改任一字段会清除旧预览</span></header><div><label>待补证标题<select value={manualEvidenceDraft.leadId} onChange={(event)=>updateManualEvidenceDraft("leadId",event.target.value)}><option value="">请选择</option>{evidenceGaps?.leads.filter((lead)=>evidenceGapShortlist.includes(lead.id)).map((lead)=><option key={lead.id} value={lead.id}>{lead.title}</option>)}</select></label><label>来源名称<input list="manualEvidenceSourceOptions" value={manualEvidenceDraft.sourceName} maxLength={80} onChange={(event)=>updateManualEvidenceDraft("sourceName",event.target.value)}/><datalist id="manualEvidenceSourceOptions">{manualSourceNameSuggestions.map((source)=><option key={source.id} value={source.name}>{source.aliases.join(" / ")}</option>)}</datalist><span>仅提供已登记的名称建议；不会自动抓取公众号</span>{manualSourceLinkHostHint&&<span>{manualSourceLinkHostHint}</span>}</label><label>发布者身份<select value={manualEvidenceDraft.publisherRole} onChange={(event)=>updateManualEvidenceDraft("publisherRole",event.target.value as ManualEvidenceDraft["publisherRole"])}><option value="">请选择</option><option value="original_publisher">原始发布者</option><option value="syndicated_or_repost">转载页 / 聚合页</option></select></label><label>候选标题<input value={manualEvidenceDraft.title} maxLength={300} onChange={(event)=>updateManualEvidenceDraft("title",event.target.value)}/></label><label>公开 HTTPS 链接<input type="url" value={manualEvidenceDraft.canonicalUrl} maxLength={2048} onChange={(event)=>updateManualEvidenceDraft("canonicalUrl",event.target.value)}/></label><label>发布时间（ISO 8601）<input value={manualEvidenceDraft.publishedAt} maxLength={40} placeholder="2026-08-23T08:00:00Z" onChange={(event)=>updateManualEvidenceDraft("publishedAt",event.target.value)}/></label></div><button type="button" disabled={manualEvidenceBusy||!manualEvidenceDraft.leadId||!manualEvidenceDraft.publisherRole||evidenceGapShortlist.length!==1} onClick={previewManualEvidence}>{manualEvidenceBusy?"校验中…":"预览人工来源（不保存）"}</button>{manualEvidencePreview?.readyForHumanEvidenceReview&&manualEvidencePreview.targets?.flatMap((target)=>target.candidates.map((candidate)=><section key={candidate.id}><b>{candidate.title}</b><span>{candidate.publisherRole==="original_publisher"?"原始发布者":"转载页"} · {target.originalHost} → {candidate.candidateHost} · 较原来源 {candidate.publishedDeltaHours>0?"+":""}{candidate.publishedDeltaHours} 小时</span>{target.originalEvidence&&<a href={target.originalEvidence.canonicalUrl} target="_blank" rel="noreferrer">人工打开原始来源</a>}<a href={candidate.canonicalUrl} target="_blank" rel="noreferrer">人工打开候选来源</a><button type="button" onClick={()=>selectManualEvidenceCandidate(target.leadId,candidate.id)}>进入六项审查预览</button></section>))}{manualEvidencePreview&&<footer>{manualEvidencePreview.readyForHumanEvidenceReview?`已接受 ${manualEvidencePreview.summary?.candidatesAccepted??0} 条临时候选；可进入审查但不能保存来源锁`:`已阻断：${manualEvidencePreview.blockers.map(formatManualEvidenceBlocker).join(" / ")}`} · 候选 URL 请求 0 · 保存 0 · 来源锁 0</footer>}</aside>}
          {evidenceMetadataPreview&&<div className="evidenceMetadataResults">{evidenceMetadataPreview.targets.flatMap((target)=>target.candidates.map((candidate)=><article className={evidenceReviewDecisions[target.leadId]?.candidateId===candidate.id?"selected":""} key={`${target.leadId}:${candidate.id}`}><div><small>待人工判断 · {candidate.sourceName} · 标题相似度 {candidate.titleSimilarity} · 较原来源 {candidate.publishedDeltaHours>0?"+":""}{candidate.publishedDeltaHours} 小时</small><b>{candidate.title}</b><span>原来源 {target.originalHost??"主机未知"} → 候选 {candidate.candidateHost??"主机未知"} · 共同词项：{candidate.sharedTerms.join(" / ")}</span></div><div>{target.originalEvidence&&<a href={target.originalEvidence.canonicalUrl} target="_blank" rel="noreferrer">查看原来源</a>}<a href={candidate.canonicalUrl} target="_blank" rel="noreferrer">查看候选来源</a><button type="button" onClick={()=>selectEvidenceCandidate(target.leadId,candidate.id)}>{evidenceReviewDecisions[target.leadId]?.candidateId===candidate.id?"已选择":"选择候选"}</button></div></article>))}{evidenceMetadataPreview.summary.candidatesReturned===0&&<p>本轮公开 RSS 元数据没有达到宽松候选阈值；不把“没有找到”解释为事件不存在。</p>}</div>}
          {Object.keys(evidenceReviewDecisions).length>0&&<aside className="evidenceReviewForm"><header><b>人工证据审查（本次页面临时状态）</b><span>{evidenceReviewPreview?.readyForAuthorizedSourceLockSave?"预览通过，可生成不保存计划":evidenceReviewPreview?.humanEvidenceReviewComplete?"审查预览完成，但仍有下游阻塞":"完成六项判断后只生成预览"}</span></header>{Object.entries(evidenceReviewDecisions).map(([leadId,decision])=><div key={leadId}><strong>{evidenceMetadataPreview?.targets.find((target)=>target.leadId===leadId)?.candidates.find((candidate)=>candidate.id===decision.candidateId)?.title??manualEvidencePreview?.targets?.find((target)=>target.leadId===leadId)?.candidates.find((candidate)=>candidate.id===decision.candidateId)?.title}</strong><span>人工核验进度：{Object.values(decision.checks).filter(Boolean).length}/{evidenceReviewChecklist.length}</span><span>待确认：{evidenceReviewChecklist.filter(({id})=>!decision.checks[id]).map(({label})=>label).join(" / ")||"无"}</span>{decision.candidateMode==="manual_public_metadata"&&<span>发布者身份：{formatManualEvidencePublisherRole(manualEvidencePreview?.targets?.find((target)=>target.leadId===leadId)?.candidates.find((candidate)=>candidate.id===decision.candidateId)?.publisherRole)}</span>}{decision.candidateMode==="manual_public_metadata"&&<ManualEvidenceReviewLinks preview={manualEvidencePreview} leadId={leadId} candidateId={decision.candidateId}/>}{evidenceReviewChecklist.map(({id,label})=><label key={id}><input type="checkbox" checked={decision.checks[id]} onChange={()=>toggleEvidenceReviewCheck(leadId,id)}/>{label}</label>)}</div>)}<div className="evidenceReviewActions"><button type="button" disabled={evidenceReviewBusy} onClick={previewEvidenceReview}>{evidenceReviewBusy?"核对中…":"预览证据审查（不保存）"}</button><button type="button" disabled={!evidenceReviewPreview?.readyForAuthorizedSourceLockSave||sourceLockSavePlanBusy} onClick={previewSourceLockSavePlan}>{sourceLockSavePlanBusy?"绑定中…":"生成来源锁保存计划（不保存）"}</button><button type="button" disabled={!sourceLockSavePlan?.readyForAuthorizationRequest||sourceLockSaveAuthorizationPreviewBusy} onClick={previewSourceLockSaveAuthorization}>{sourceLockSaveAuthorizationPreviewBusy?"生成中…":"预览单次保存授权（不授权）"}</button></div>{evidenceReviewPreview&&<footer>合格 {evidenceReviewPreview.summary.targetsEligible}/{evidenceReviewPreview.summary.targetsRequired} · 审查指纹 {evidenceReviewPreview.reviewFingerprint?.slice(0,16)??"未生成"}{evidenceReviewPreview.blockers.length?` · 需修正 ${evidenceReviewPreview.blockers.map(formatEvidenceReviewBlocker).join(" / ")}`:""} · 下游阻塞 {evidenceReviewPreview.downstreamBlockers.join(" / ")||"无"} · 来源锁仍为 0</footer>}{sourceLockSavePlan&&<footer>计划记录 {sourceLockSavePlan.plannedRecordCount} · 计划指纹 {sourceLockSavePlan.savePlanFingerprint?.slice(0,16)??"未生成"}{sourceLockSavePlan.blockers.length?` · 需修正 ${sourceLockSavePlan.blockers.map(formatSourceLockPlanBlocker).join(" / ")}`:""} · 授权未授予 · 写库 0</footer>}{sourceLockSavePlan&&sourceLockSaveAuthorizationPreview&&<footer>授权预览 {sourceLockSaveAuthorizationPreview.authorizationPreviewFingerprint?.slice(0,16)??"未生成"}{sourceLockSaveAuthorizationPreview.blockers.length?` · 需修正 ${sourceLockSaveAuthorizationPreview.blockers.map(formatSourceLockAuthorizationBlocker).join(" / ")}`:""} · 确认短语仅供核对：<code>{sourceLockSaveAuthorizationPreview.requiredConfirmation??"无"}</code> · 未授权 · 保存 0</footer>}</aside>}
          <footer>本次临时选择 {evidenceGapShortlist.length} · RSS 元数据候选 {evidenceMetadataPreview?.summary.candidatesReturned??0} · 审查保存 0 · 事实核验 0 · 来源锁 0 · 草稿解锁 0 · 发布 0</footer>
        </section>
        <section className="controlStrip">
          <div><small>01</small><b>选择图文平台</b></div>
          <div className="platformToggles">{Object.entries(platformMeta).map(([key,p])=><button key={key} className={platforms.includes(key)?"on":""} onClick={()=>togglePlatform(key)} style={{"--platform":p.color} as React.CSSProperties}><span/>{p.name}<small>{p.region}</small></button>)}</div>
          <div className="selectionCount"><strong>{selected.length}</strong><span>/ 3 已选择</span></div>
          <button className="generate" disabled={busy} onClick={queueGeneration}>{busy?"创建中…":"生成来源锁定草稿 →"}</button>
        </section>
        <div className="ideaHeader"><div><b>今日 10 个热点角度</b><span>候选必须保留来源、时间和不确定性；评分只用于相对排序，不承诺播放量。</span></div><div className="legend"><i className="dy"/>抖音图文 <i className="tk"/>美国来源 <i className="xhs"/>小红书</div></div>
        <section className="ideasGrid">{ideas.map((idea,index)=><article key={idea.id} className={idea.selected?"idea selected":"idea"} onClick={()=>toggleIdea(idea)}>
          <div className="ideaIndex">{String(index+1).padStart(2,"0")}<button aria-label={idea.selected?"取消选择":"选择"}>{idea.selected?"✓":"+"}</button></div>
          <span className="category">{idea.category}</span><h2>{idea.title}</h2><p>{idea.angle}</p>
          <div className="scores"><div><span>抖音</span><b>{idea.douyinScore}</b></div><div><span>TikTok</span><b>{idea.tiktokScore}</b></div><div><span>小红书</span><b>{idea.xhsScore}</b></div></div>
          <footer><span>{idea.status === "generating" ? "已进入生成队列" : idea.selected ? "已入选" : "点击选择"}</span><b>平均 {Math.round((idea.douyinScore+idea.tiktokScore+idea.xhsScore)/3)}</b></footer>
        </article>)}</section>
      </>}

      {view === "production" && <section className="panel">
        <div className="panelTitle"><div><small>02 / PRODUCTION</small><h2>生成队列</h2></div><button onClick={()=>setView("ideas")}>＋ 添加选题</button></div>
        <section className={scriptAcceptance.ready?"scriptAcceptanceCard ready":"scriptAcceptanceCard waiting"}><header><div><small>SCRIPT ACCEPTANCE · 本机临时复核</small><b>剧本事实验收</b></div><span>{scriptAcceptance.ready?"人工语义复核已完整":scriptAcceptance.scriptOutputPresent?"已发现真实剧本，等待人工复核":"等待真实剧本输出"}</span></header><div><span><b>{scriptAcceptance.counts.accountedClaims}/{scriptAcceptance.counts.knownClaims}</b>主张已登记</span><span><b>{scriptAcceptance.counts.includedClaims}</b>主张已采用</span><span><b>{scriptAcceptance.counts.uncitedFactualClaims??"—"}</b>未引用事实声明</span><span><b>{scriptAcceptance.scriptOutputPresent?"有":"无"}</b>真实剧本输出</span></div>{scriptAcceptance.reviewDraft&&<aside className="scriptReviewDraft"><header><b>人工复核草稿</b><code>剧本 {scriptAcceptance.reviewDraft.outputFingerprint?.slice(0,12)??"无指纹"}… · 当前页面 {activeScriptReviewCount}/{scriptAcceptance.reviewDraft.totalChecks}</code></header>{scriptAcceptance.discovery?.artifact&&<a href={`http://127.0.0.1:3013/film/${scriptAcceptance.discovery.artifact.dramaId}`} target="_blank" rel="noreferrer">打开 LocalMiniDrama 查看真实剧本 →</a>}<div>{scriptAcceptance.reviewDraft.checks.map((check)=><label className={activeScriptReviewChecks[check.id]?"done":""} key={check.id}><input type="checkbox" checked={activeScriptReviewChecks[check.id]===true} disabled={!activeScriptFingerprint} onChange={(event)=>updateScriptReviewCheck(check.id,event.target.checked)} />{scriptReviewCheckLabels[check.id]??check.id}</label>)}</div><label className="scriptReviewConfirm"><input type="checkbox" checked={scriptReviewFingerprintConfirmed} onChange={(event)=>{setScriptReviewFingerprintConfirmed(event.target.checked);setScriptReviewPreview(null);setScriptReviewPersistConfirmed(false);setScriptReviewAcceptanceResult(null)}} />我确认以上勾选对应当前剧本指纹和来源锁指纹；这里只检查完整性，不保存结论</label><button type="button" disabled={scriptReviewPreviewBusy||!scriptAcceptance.reviewDraft.reviewable} onClick={previewScriptReview}>{scriptReviewPreviewBusy?"检查中…":"检查复核完整性（不保存）"}</button>{scriptReviewPreviewIsCurrent&&scriptReviewPreview&&<div className={scriptReviewPreview.preview.previewComplete?"scriptReviewPreview complete":"scriptReviewPreview blocked"}><b>{scriptReviewPreview.preview.previewComplete?"复核输入完整，但仍未记录":"复核输入仍不完整"}</b><span>{scriptReviewPreview.preview.blockers.length?scriptReviewPreview.preview.blockers.join(" · "):"输入阻塞 0"}</span><em>验收阻塞：{scriptReviewPreview.preview.acceptanceBlockers.join(" · ")} · 分镜仍锁定</em>{scriptReviewPreview.preview.previewFingerprint&&<code>预览 {scriptReviewPreview.preview.previewFingerprint.slice(0,12)}…</code>}</div>}{scriptReviewPreviewIsCurrent&&scriptReviewPreview?.preview.previewComplete&&<section className="scriptReviewPersist"><label><input type="checkbox" checked={scriptReviewPersistConfirmed} onChange={(event)=>setScriptReviewPersistConfirmed(event.target.checked)} />我确认把当前 7 项人工结论、剧本指纹和来源锁指纹写入 D1 验收记录</label><button type="button" disabled={!scriptReviewPersistConfirmed||scriptReviewPersistBusy} onClick={persistScriptReview}>{scriptReviewPersistBusy?"保存中…":"保存人工验收记录"}</button><span>只记录审计证据 · 不调用模型 · 不生成角色或分镜</span>{scriptReviewAcceptanceResult?.accepted&&<b>验收已记录：{scriptReviewAcceptanceResult.record?.reviewedAt}</b>}{scriptReviewAcceptanceResult?.migrationRequired&&<b>存储尚未初始化：需要迁移 {scriptReviewAcceptanceResult.migrationRequired}</b>}</section>}<footer>页面勾选本身不会解锁；只有与当前指纹匹配的持久化验收记录才能进入角色与分镜规划</footer></aside>}<footer><span>{scriptAcceptance.discovery?.artifact?`LocalMiniDrama 项目 #${scriptAcceptance.discovery.artifact.dramaId} · ${scriptAcceptance.discovery.artifact.scriptEpisodeCount}/${scriptAcceptance.discovery.artifact.episodeCount} 集有剧本 · 来源锁${scriptAcceptance.discovery.artifact.sourceLockProvenancePresent?"已绑定":"未绑定"}`:"语义核验必须人工完成；系统不自动宣称事实正确"}</span><em>正文不返回 · 调用 0 · 费用 0 · 不生成分镜 · 不可发布</em></footer></section>
        <section className={preproductionGate.ready?"preproductionGate ready":"preproductionGate blocked"}><header><div><small>PREPRODUCTION GATE · 只读</small><b>{preproductionGate.ready?"角色与分镜规划条件完整":"角色与分镜保持锁定"}</b></div><span>不会自动调用任何生成引擎</span></header><div><article><i>{preproductionGate.outputFingerprint?"✓":"×"}</i><b>真实剧本</b><span>{preproductionGate.outputFingerprint?`${preproductionGate.outputFingerprint.slice(0,12)}…`:"缺少输出指纹"}</span></article><article><i>{preproductionGate.sourceLockBound?"✓":"×"}</i><b>来源锁绑定</b><span>{preproductionGate.sourceLockBound?"指纹一致":"产物未携带来源锁"}</span></article><article><i>{preproductionGate.persistedReviewAccepted?"✓":"×"}</i><b>持久化复核</b><span>{preproductionGate.persistedReviewAccepted?"已验收":"尚无验收记录"}</span></article><article><i>0</i><b>执行动作</b><span>角色 0 · 分镜 0</span></article></div><footer><b>当前阻塞</b><span>{preproductionGate.blockers.length?preproductionGate.blockers.join(" · "):"规划条件完整；执行仍需独立授权"}</span><em>LocalMiniDrama {preproductionGate.localMiniDramaCalls} · LumenX {preproductionGate.lumenXCalls} · 费用 0 · 发布 0</em></footer></section>
        <section className="executionPreparation"><header><div><small>EXECUTION PREPARATION · 只读</small><b>真实执行保持关闭</b></div><span>票据有效期 {Math.round(executionPreparation.receiptTtlSeconds/60)} 分钟 · 不提供执行按钮</span></header><div><article><i>{executionPreparation.executorEnabled?"✓":"×"}</i><b>执行器</b><span>{executionPreparation.executorEnabled?"已启用":"固定关闭"}</span></article><article><i>{executionPreparation.migrationVerification==="verified"?"✓":"!"}</i><b>票据迁移</b><span>{executionPreparation.migrationVerification==="verified"?"已验证":"未验证应用"}</span></article><article><i>{executionPreparation.receiptIssued?"✓":"—"}</i><b>票据状态</b><span>{executionPreparation.receiptIssued?"已签发":"未签发 / 未消费"}</span></article><article><i>0</i><b>真实动作</b><span>调用 0 · 费用 0 · 发布 0</span></article></div><footer><b>当前阻塞</b><span>{executionPreparation.blockers.map(blocker=>executionPreparationLabels[blocker]??blocker).join(" · ")}</span><em>数据库写入 {executionPreparation.databaseWriteAttempted?"已尝试":"0"} · 模型执行 {executionPreparation.executionTriggered?"已触发":"0"}</em></footer></section>
        <section className={receiptMigration.readyToApplyLocally?"migrationReadiness ready":"migrationReadiness blocked"}><header><div><small>LOCAL D1 MIGRATION · 只读计划</small><b>{receiptMigration.readyToApplyLocally?"迁移守卫已就绪，等待明确授权":"迁移守卫仍有阻塞"}</b></div><span>本卡不执行迁移</span></header><div><article><i>{receiptMigration.localOnly?"✓":"!"}</i><b>作用范围</b><span>{receiptMigration.localOnly?"仅限本机":"范围异常"}</span></article><article><i>{receiptMigration.targetBinding==="DB"?"✓":"!"}</i><b>数据绑定</b><span>{receiptMigration.targetBinding}</span></article><article><i>{receiptMigration.migrationTag==="0003_faithful_harry_osborn"?"✓":"!"}</i><b>迁移版本</b><span>0003 · 票据审计</span></article><article><i>{receiptMigration.storage?.status==="missing"||receiptMigration.storage?.status==="verified"?"✓":"!"}</i><b>当前结构</b><span>{receiptMigration.storage?.status==="missing"?"尚未应用，可安全创建":receiptMigration.storage?.status==="verified"?"已经验证":"状态未确认"}</span></article></div><footer><b>安全边界</b><span>默认仅规划 · 无删除语句 · 无模型调用 · 无发布</span><em>应用 {receiptMigration.applyPerformed?"已执行":"0"} · 数据库写入 {receiptMigration.databaseWrites?"已发生":"0"}</em></footer></section>
        {pilotApprovalReceipt&&<div className="pilotFingerprint"><b>最近生成的执行授权指纹</b><code>{pilotApprovalReceipt.hash}</code><small>模型、报价或预算变化后旧指纹会自动失效</small></div>}
        {packageReadiness.generationPlan?.pilotApproval&&<section className="pilotQuotePanel"><div><b>人工报价快照</b><small>价格未联网核验；请按供应商价格页填写本次图像与视频调用的单次报价。</small></div><div className="pilotQuoteFields"><label>图像单次报价（元）<input type="number" min="0.000001" step="0.000001" value={pilotImageCost} onChange={(event)=>{setPilotImageCost(event.target.value);setPilotPreview(null)}} placeholder="按价格页填写" /></label><label>视频单次报价（元）<input type="number" min="0.000001" step="0.000001" value={pilotVideoCost} onChange={(event)=>{setPilotVideoCost(event.target.value);setPilotPreview(null)}} placeholder="按价格页填写" /></label></div><label className="pilotConsent"><input type="checkbox" checked={pilotPricingConfirmed} onChange={(event)=>{setPilotPricingConfirmed(event.target.checked);setPilotPreview(null)}} />我已从供应商价格页人工核对这两个单次报价；系统未联网验证价格</label>{pilotPreview?.gate.quotedTotalCostCny!==null&&<em>人工报价合计 ¥{pilotPreview.gate.quotedTotalCostCny.toFixed(6)} / 最高预算 ¥{pilotPreview.gate.maxCostCny?.toFixed(2)??"未设置"}</em>}</section>}
        <div className={packageReadiness.eligible?"readinessPanel eligible":"readinessPanel blocked"}><div><small>REVIEW READINESS</small><b>{packageReadiness.eligible?"已具备人工审核资格":"尚未具备人工审核资格"}</b>{packageReadiness.factReviewEvidence&&<em>事实证据：{packageReadiness.factReviewEvidence.citedClaimCount}/{packageReadiness.factReviewEvidence.claimCount} 条主张已关联 · {packageReadiness.factReviewEvidence.sourceCount} 个来源 · 未联网复查</em>}{packageReadiness.engineOutputs&&<em>{packageReadiness.engineOutputs.storyboardCount} 分镜 · {packageReadiness.engineOutputs.sceneVideoCount} 视频 · {packageReadiness.engineOutputs.storyboardAudioReadyCount} 分镜配音 · {packageReadiness.engineOutputs.finalVideoCount} 成片</em>}<button className="syncArtifacts" disabled={syncBusy || packageReadiness.mode !== "local"} onClick={syncLocalArtifacts}>{syncBusy?"同步中…":"同步真实产物"}</button></div>{packageReadiness.checks.length ? <div className="readinessChecks">{packageReadiness.checks.map((check)=><span className={check.ready?"ready":"blocked"} key={check.id} title={check.detail}><i>{check.ready?"✓":"!"}</i>{readinessLabels[check.id] ?? check.id}</span>)}</div> : <p>{packageReadiness.error ?? "只能在本机核对真实媒体文件"}</p>}</div>
        <section className={scriptPlan.readyForAuthorization?"scriptPlanCard ready":"scriptPlanCard blocked"}><header><div><small>SOURCE-LOCKED SCRIPT · 只读</small><b>事实锁定剧本计划</b></div><span>{scriptPlan.readyForAuthorization?"请求结构已准备，等待模型与成本确认":"计划仍有阻塞"}</span></header><div><article><b>{scriptPlan.claimCount}</b><span>已核验主张</span></article><article><b>{scriptPlan.sourceCount}</b><span>保留来源</span></article><article><b>{scriptPlan.targetPlatforms.length}</b><span>目标平台</span></article><article><b>0</b><span>实际模型调用</span></article></div><footer><code>{scriptPlan.sourceLockFingerprint?`${scriptPlan.sourceLockFingerprint.slice(0,12)}…`:"尚无输入指纹"}</code><span>LocalMiniDrama 写剧本 → {scriptPlan.downstream?.engine??"LumenX"} 等待剧本/分镜</span><em>不返回完整提示词 · 不执行 · 费用 0 · 不可发布</em></footer></section>
        <section className="scriptApprovalForm"><header><div><small>SCRIPT AUTHORIZATION · 预览</small><b>剧本模型授权条件</b></div><span>只生成授权指纹，不接收密钥、不调用模型</span></header>{!localEngine.textConfigured&&<aside className="scriptConfigGuide"><div><small>TEXT MODEL SETUP · 本机</small><b>先在 LocalMiniDrama 配置文本模型</b><p>知绘操作台不提供密钥输入框；供应商密钥只应填写在 LocalMiniDrama 自己的本机设置中。</p></div><ol><li><i>1</i><span><b>打开本机设置</b><em>进入 AI 服务配置，不会由知绘代填</em></span></li><li><i>2</i><span><b>添加文本服务</b><em>选择供应商、模型，并在该页面自行保存密钥</em></span></li><li><i>3</i><span><b>返回刷新</b><em>先刷新本机状态，再做报价与授权预览</em></span></li></ol><a href="http://127.0.0.1:3013/ai-config" target="_blank" rel="noreferrer">打开 LocalMiniDrama 配置页 →</a><footer>不会自动测试连接 · 不会读取或回传密钥 · 不会产生模型费用</footer></aside>}{localEngine.textConfigured&&<div className="scriptConfigDetected"><b>已发现本机文本配置</b><span>仅检查到配置记录；连接、模型质量和价格仍未验证。</span></div>}<div className="scriptApprovalFields"><label>供应商<select value={scriptProvider} onChange={(event)=>{setScriptProvider(event.target.value);setScriptPreview(null)}}><option value="">尚未选择</option><option value="dashscope">DashScope / 阿里云百炼</option><option value="openai-compatible">OpenAI 兼容接口</option></select></label><label>文本模型<input value={scriptTextModel} onChange={(event)=>{setScriptTextModel(event.target.value);setScriptPreview(null)}} maxLength={120} placeholder="例如 qwen-plus" /></label><label>单次人工报价（元）<input type="number" min="0" step="0.000001" value={scriptCost} onChange={(event)=>{setScriptCost(event.target.value);setScriptPreview(null)}} placeholder="按价格页填写" /></label><label>最高预算（元）<input type="number" min="0.01" step="0.01" value={scriptMaxCost} onChange={(event)=>{setScriptMaxCost(event.target.value);setScriptPreview(null)}} placeholder="例如 1.00" /></label></div><label className="scriptApprovalCheck"><input type="checkbox" checked={scriptPricingConfirmed} onChange={(event)=>{setScriptPricingConfirmed(event.target.checked);setScriptPreview(null)}} />我已人工核对供应商价格；系统没有联网验证报价</label><label className="scriptApprovalCheck"><input type="checkbox" checked={scriptConsent} onChange={(event)=>{setScriptConsent(event.target.checked);setScriptPreview(null)}} />我确认当前来源指纹、模型、报价和预算；这里只做预览，不执行生成</label><button type="button" disabled={scriptPreviewBusy} onClick={previewScriptApproval}>{scriptPreviewBusy?"检查中…":"检查授权条件（不会执行）"}</button>{scriptApprovalFingerprint&&<code className="scriptApprovalHash">授权指纹 {scriptApprovalFingerprint.hash.slice(0,16)}…</code>}{scriptPreview&&<div className={scriptPreview.gate.eligible?"scriptApprovalResult eligible":"scriptApprovalResult blocked"}><b>{scriptPreview.gate.eligible?"授权条件完整，但执行仍关闭":"仍被安全闸门阻止"}</b><span>{scriptPreview.gate.blockers.length?scriptPreview.gate.blockers.join(" · "):"无阻塞项"}</span><em>配置 {scriptPreview.configurationStatus === "configured_unverified"?"已发现但未测试":"缺失"} · 调用 0 · 费用 0 · 未生成</em></div>}</section>
        {packageReadiness.lumenxAdapterPlan&&<section className={packageReadiness.lumenxAdapterPlan.contractReady?"adapterPlan ready":"adapterPlan blocked"}><div><small>LUMENX PLAYGROUND · 仅规划</small><b>LumenX 本机适配器</b><span>{packageReadiness.lumenxAdapterPlan.contractReady?"请求结构已接通":"计划仍有阻塞"}</span></div><ol>{packageReadiness.lumenxAdapterPlan.steps.map((step,index)=><li key={step.id}><i>{index+1}</i><div><b>{step.mode==="t2i"?"生成竖屏静帧":step.mode==="i2v"?"静帧生成视频":step.mode??step.id}</b><code>{step.modelId??"模型未选择"}</code></div>{step.dependsOn&&<em>依赖上一步</em>}</li>)}</ol>{packageReadiness.lumenxAdapterPlan.blockers.length>0&&<p>阻塞：{packageReadiness.lumenxAdapterPlan.blockers.join(" · ")}</p>}<footer>模型目录：本机快照 · 价格{packageReadiness.lumenxAdapterPlan.pricingVerified?"已核验":"未核验"} · 完整提示词不返回 · 外部调用 {packageReadiness.lumenxAdapterPlan.externalCalls} · 费用 0 · 不可发布</footer></section>}
        {packageReadiness.generationPlan&&<div className="generationPlan"><div className="generationPlanHead"><b>真实产物生成计划</b><span>仅规划 · 不自动调用模型</span></div>{packageReadiness.generationPlan.pilotApproval&&<><div className="pilotApproval"><b>首次验收 · 分镜 #{packageReadiness.generationPlan.pilotApproval.storyboardNumber}</b><span>{packageReadiness.generationPlan.pilotApproval.duration} 秒 · {packageReadiness.generationPlan.pilotApproval.aspectRatio} · 输入{packageReadiness.generationPlan.pilotApproval.inputComplete?"完整":"不完整"}</span><span>计划：2 次外部模型调用 + 1 次本机配音 · 费用待选择模型后确认</span><code>请求指纹 {packageReadiness.generationPlan.pilotApproval.requestHash.slice(0,12)}…</code><em>等待你的授权 · 不可发布</em></div>{packageReadiness.generationPlan.pilotApproval.executionGate&&<div className="executionGate"><b>执行闸门：{packageReadiness.generationPlan.pilotApproval.executionGate.eligible?"本次试片已获授权":"阻止执行"}</b><span>{packageReadiness.generationPlan.pilotApproval.executionGate.blockers.map(blocker=>approvalBlockerLabels[blocker]??blocker).join(" · ")}</span><em>单个分镜 · 不自动执行 · 当前费用 0</em></div>}<section className="pilotPreviewForm"><div><b>单分镜授权预览</b><small>填写后只检查执行条件，不读取密钥、不调用模型。</small></div><div className="pilotPreviewFields"><label>供应商<select value={pilotProvider} onChange={(event)=>{setPilotProvider(event.target.value);setPilotPreview(null)}}><option value="">尚未选择</option><option value="dashscope">DashScope / 阿里云百炼</option></select></label><label>图像模型<input value={pilotImageModel} onChange={(event)=>{setPilotImageModel(event.target.value);setPilotPreview(null)}} maxLength={120} placeholder="例如 wan2.7-image-pro" /></label><label>视频模型<input value={pilotVideoModel} onChange={(event)=>{setPilotVideoModel(event.target.value);setPilotPreview(null)}} maxLength={120} placeholder="例如 happyhorse-1.1-i2v" /></label><label>最高预算（元）<input type="number" min="0.01" step="0.01" value={pilotMaxCost} onChange={(event)=>{setPilotMaxCost(event.target.value);setPilotPreview(null)}} placeholder="例如 5.00" /></label></div><label className="pilotConsent"><input type="checkbox" checked={pilotConsent} onChange={(event)=>{setPilotConsent(event.target.checked);setPilotPreview(null)}} />我确认这是当前请求指纹；这里只生成授权预览，不执行模型</label><button type="button" disabled={pilotPreviewBusy} onClick={previewPilotApproval}>{pilotPreviewBusy?"生成中…":"生成授权预览（不会执行）"}</button>{pilotPreview&&<div className={pilotPreview.gate.eligible?"pilotPreviewResult eligible":"pilotPreviewResult blocked"}><b>{pilotPreview.gate.eligible?"预览条件完整":"仍被阻止"}</b><span>{pilotPreview.gate.blockers.length?pilotPreview.gate.blockers.map(blocker=>approvalBlockerLabels[blocker]??blocker).join(" · "):"无阻塞项"}</span><em>外部调用 0 · 费用 0 · 未生成 · 不可发布</em></div>}</section></>}{packageReadiness.generationPlan.stages.map(stage=><div className={stage.ready?"generationStage ready":"generationStage blocked"} key={stage.id}><i>{stage.ready?"✓":stage.completed}/{stage.total}</i><div><b>{stage.label}</b><small>{stage.engine} · {stage.engineReady?"引擎可用":"引擎受阻"}</small><span>{stage.detail}{stage.blockerDetail&&stage.blockerDetail!==stage.detail?` · ${stage.blockerDetail}`:""}{stage.authorizationRequired?" · 需授权":""}</span></div></div>)}</div>}
        {localProjects.length > 0 && <div className="localProjects">
          <div className="localProjectsHead"><b>本机真实项目</b><span>{localEngine.textConfigured?"剧本模型已连接":"等待配置文本模型"}</span></div>
          {localProjects.map((project) => <a href={project.projectUrl} target="_blank" rel="noreferrer" key={`${project.id}-${project.title}`}>
            <span>#{project.id}</span><b>{project.title}</b><em>{project.nextAction === "story_generating" ? "剧本生成中" : project.nextAction === "packaging_ready" ? `三平台文案已就绪 · 待成片` : project.nextAction === "storyboards_ready" ? `预制作完成 · ${project.storyboardCount ?? 0} 个分镜` : project.nextAction === "story_ready" ? `剧本已就绪 · ${project.episodeCount ?? 1} 集` : "已建项目 · 待配置模型"}</em><strong>打开项目 →</strong>
          </a>)}
        </div>}
        {jobs.length ? <div className="jobList">{jobs.map((job,index)=><div className="job" key={job.id}><strong>{String(index+1).padStart(2,"0")}</strong><div><b>{ideas.find(i=>i.id===job.ideaId)?.title ?? job.ideaId}</b><span>{job.platforms.split(",").map(p=>platformMeta[p as keyof typeof platformMeta]?.name).join(" · ")}</span></div><div className="jobStage">{job.stage}<span><i style={{width:`${Math.max(job.progress,8)}%`}}/></span></div><em>{job.status === "queued" ? "等待模型配置" : job.status}</em></div>)}</div> : <div className="empty"><b>还没有生成任务</b><p>回到今日选题，选择1–3个题目后创建任务。</p></div>}
        <div className="productionSteps">{["中英文脚本","事实核验","角色与分镜","配音与字幕","三平台包装","人工审核"].map((x,i)=><div key={x}><span>{i+1}</span><b>{x}</b><small>{i===0?"同一事实，不同钩子":i===4?"标题、封面、比例分别生成":"完成后进入下一步"}</small></div>)}</div>
      </section>}

      {view === "review" && <section className="panel"><div className="panelTitle"><div><small>03 / HUMAN GATE</small><h2>没有你的确认，不会发布</h2></div></div><div className="reviewCard"><div><div className="mockVideo"><span>9:16</span><b>预览区</b><small>生成成片后显示</small></div><div className="reviewHistory"><h3>审核历史</h3>{reviewAudits.length ? reviewAudits.map((audit)=><div key={audit.id}><b>{new Date(audit.createdAt).toLocaleString("zh-CN")}</b><span>{audit.publishTriggered ? "异常：曾触发发布" : "仅记录 · 未发布"}</span></div>) : <p>{reviewHistoryStatus}</p>}</div></div><div className="checklist"><h3>发布前检查</h3><p>{reviewTarget ? `当前任务：${ideas.find((idea)=>idea.id===reviewTarget.ideaId)?.title ?? reviewTarget.ideaId} · ${reviewReady ? "可审核" : "尚未完成生产"}` : "暂无可审核任务"}</p>{reviewChecklist.map(({id,label})=><label key={id}><input type="checkbox" checked={reviewChecks[id]} disabled={!reviewReady} onChange={(event)=>setReviewChecks((checks)=>({...checks,[id]:event.target.checked}))}/>{label}</label>)}<button className={reviewReady&&reviewComplete?"ready":""} disabled={!reviewTarget || !reviewReady || !reviewComplete || reviewBusy} onClick={recordReview}>{reviewTarget?.status === "approved_for_manual_publish" ? "已记录审核 · 尚未发布" : !reviewReady ? "等待成片进入审核" : reviewBusy ? "正在记录…" : "记录人工审核（不会发布）"}</button></div></div></section>}

      {view === "metrics" && <section className="panel"><div className="panelTitle"><div><small>04 / LEARNING LOOP</small><h2>账号专属评分器</h2></div></div><section className={isolatedChain.verified?"isolatedChain verified":"isolatedChain pending"}><div><small>ISOLATED SQLITE · 结构演练</small><b>{isolatedChain.verified?"0000–0006 隔离应用与结构检查通过":isolatedChain.status==="unavailable"?"等待桥接服务更新后显示隔离验证":"隔离验证尚未完成"}</b></div><span>{isolatedChain.appliedTags.length}/{isolatedChain.totalSteps} 已隔离应用 · 失败回滚 {isolatedChain.rollbackPerformed?(isolatedChain.rollbackVerified?"已验证":"待确认"):"未触发"}</span><em>真实 D1 写入 {isolatedChain.liveDatabaseWrites?"已发生":"0"} · 业务结果 {isolatedChain.businessResult?"是":"否"}</em></section><section className={migrationChain.current?"migrationChain current":"migrationChain blocked"}><div><small>D1 CHAIN · 0000 → 0006</small><b>{migrationChain.current?"完整迁移链已验证":migrationChain.emptyApplicationSchema?"本机 D1 为空，必须从 0000 开始":"迁移链不完整，禁止跳步"}</b></div><span>{migrationChain.completedSteps}/{migrationChain.totalSteps} 已完成 · 下一步 {migrationChain.firstPending??"无"}</span><em>应用 {migrationChain.applyPerformed?"已执行":"0"} · 写入 {migrationChain.databaseWrites?"已发生":"0"}</em></section><section className={metricsMigration.storage?.verified?"metricsMigration verified":"metricsMigration pending"}><div><small>D1 METRICS · 只读结构检查</small><b>{metricsMigration.storage?.verified?"指标来源结构已验证":metricsMigration.readyToApplyLocally?"0004 迁移已就绪，等待明确授权":"指标来源结构仍有阻塞"}</b></div><span>来源字段 {metricsMigration.storage?.columnsPresent.length??0}/4 · 防重复索引 {metricsMigration.storage?.indexPresent?"已存在":"未创建"}</span><em>应用 {metricsMigration.applyPerformed?"已执行":"0"} · 数据库写入 {metricsMigration.databaseWrites?"已发生":"0"}</em></section><div className={metricFeedStatus.status==="verified"?"metricProvenance verified":"metricProvenance blocked"}><b>{metricFeedStatus.status==="verified"?"只显示带平台来源证明的真实指标":metricFeedStatus.status==="storage_unavailable"?"指标存储尚未就绪":"等待平台 API 或官方导出数据"}</b><span>来源不明的记录不会展示、训练或参与排序</span><em>排除 {metricFeedStatus.recordsExcluded} 条 · 写入 {metricFeedStatus.writePerformed?"已发生":"0"} · 发布 {metricFeedStatus.publishTriggered?"已触发":"0"}</em></div><div className="metricCards"><div><span>已收集播放</span><b>{metricFeedStatus.status==="verified"?totalViews.toLocaleString():"—"}</b></div><div><span>平均完播率</span><b>{metricFeedStatus.status==="verified"?`${avgCompletion}%`:"—"}</b></div><div><span>有效样本</span><b>{metrics.length}</b></div><div><span>可训练阈值</span><b>30 条</b></div></div><div className="learningGrid"><div><h3>三平台平均播放</h3>{platformAverages.map(row=><div className="bar" key={row.key}><span>{platformMeta[row.key as keyof typeof platformMeta].name}</span><i><b style={{width:`${Math.min(100,row.views/100)}%`}}/></i><strong>{metricFeedStatus.status==="verified"?(row.views || "待积累"):"未接入"}</strong></div>)}</div><div className="formula"><h3>相对潜力分怎么来</h3><p><b>35%</b> 前5秒留存</p><p><b>25%</b> 完播率</p><p><b>20%</b> 收藏与分享</p><p><b>10%</b> 关注转化</p><p><b>10%</b> 单条制作成本</p><small>30条以前使用规则评分；30条以后按你自己的真实数据校准，不伪造具体播放量。</small></div></div></section>}

      {view === "accounts" && <section className="panel">
        <div className="panelTitle"><div><small>05 / CONNECTIONS</small><h2>账号与生成引擎</h2></div></div>
        <section className="connectionGate">
          <div className="connectionGateHead"><div><small>LUMENX / DASHSCOPE</small><h3>LumenX 连接授权检查</h3></div><div className="connectionGateActions"><strong>{lumenXCredentialDetected?"已检测到配置 · 未调用":"等待你的账号操作"}</strong><button type="button" disabled={connectionRefreshBusy} onClick={refreshConnectionStatus}>{connectionRefreshBusy?"刷新中…":"刷新本机状态"}</button></div></div>
          <ol>
            <li><i>1</i><div><b>阿里云账号与协议</b><span>系统无法代替你确认登录、验证码或服务协议。</span></div><em>需本人确认</em></li>
            <li className={lumenXCredentialDetected?"done":""}><i>2</i><div><b>DashScope API Key</b><span>{lumenXCredentialDetected?"仅检测到密钥存在，不读取或显示密钥内容。":"尚未检测到 DASHSCOPE_API_KEY。"}</span></div><em>{lumenXCredentialDetected?"已检测":"未配置"}</em></li>
            <li className="done"><i>3</i><div><b>本机密钥保护</b><span>网页不提供密钥输入框；环境文件和私钥默认禁止提交 Git。</span></div><em>已启用</em></li>
            <li className={lumenXVerificationRun?"done":""}><i>4</i><div><b>首次连通与费用验证</b><span>只有你再次授权后才会执行可能产生费用的外部模型调用。</span></div><em>{lumenXVerificationRun?"已有验证记录":"从未执行"}</em></li>
          </ol>
          <p>本卡不会创建、读取、上传或测试任何 API Key。</p>
        </section>
        <section className={runtimeStatus.current?"runtimeStatus current":"runtimeStatus blocked"}><header><div><small>LOCAL RUNTIME · 只读体检</small><b>{runtimeStatus.current?"本机工作流基础服务已就绪":runtimeStatus.status==="bridge_stale"?"四项服务在线，桥接版本待更新":"存在本机服务离线"}</b></div><em>{runtimeStatus.services.filter(service=>service.online).length}/{runtimeStatus.services.length||4} 在线</em></header><div>{runtimeStatus.services.map(service=><span className={service.online?"online":"offline"} key={service.id}><i>{service.online?"✓":"!"}</i><b>{runtimeServiceLabels[service.id]??service.id}</b><small>{service.online?`HTTP ${service.statusCode}`:"未连接"}</small></span>)}</div><footer><span>{runtimeStatus.nextAction==="none"?"无需处理":runtimeStatus.nextAction==="close_old_studio_and_rerun_launcher"?"关闭旧操作台后重新运行启动器":"运行本机启动器"}</span><em>重启 0 · 下载 0 · 模型调用 0 · 发布 0</em></footer></section>
        <section className={socialDraftHandoff.status==="preview_only"?"socialDraftHandoff ready":"socialDraftHandoff blocked"}><header><div><small>XIAOHONGSHU DRAFT · 本机安全门</small><b>{socialDraftHandoff.status==="preview_only"?"单账号草稿试验已具备安全边界":"草稿交接状态暂不可用"}</b></div><em>{socialDraftHandoff.draftOnly?"仅保存草稿":"阻止操作"}</em></header><div><span><b>浏览器</b>{socialDraftHandoff.visibleBrowserRequired?"必须可见":"未限制"}</span><span><b>登录验证</b>{socialDraftHandoff.interactiveLoginRequired?"本人完成":"不可用"}</span><span><b>账号数据</b>{socialDraftHandoff.cookieExportAllowed?"异常：允许导出":"不收密码 / Cookie"}</span><span><b>发布能力</b>{socialDraftHandoff.publishActionImplemented?"异常：已实现":"永久未实现"}</span></div><footer><span>{socialDraftHandoff.packagePlan?.readyForHumanDraftReview?`待人工审核：${socialDraftHandoff.packagePlan.content.title}`:socialDraftHandoff.packagePlan?.blockers.length?`交付包阻塞：${socialDraftHandoff.packagePlan.blockers.join(" · ")}`:"下一步：本人登录 → 选择一个已审核素材包 → 生成单次草稿指纹"}</span><em>上传 {socialDraftHandoff.uploadTriggered?"已触发":"0"} · 草稿 {socialDraftHandoff.draftVerified?"已核验":"0"} · 发布 {socialDraftHandoff.publishTriggered?"已触发":"0"}</em></footer></section>
        <section className={bridgeStatus.current?"bridgeStatus current":"bridgeStatus stale"}><div><small>LOCAL BRIDGE · 能力诊断</small><b>{bridgeStatus.current?"桥接服务版本一致":"桥接服务需要安全重启"}</b><span>{bridgeStatus.current?`协议 v${bridgeStatus.reportedVersion} · 新能力已载入`:`运行版本 ${bridgeStatus.reportedVersion??"未报告"} / 期望 v${bridgeStatus.expectedVersion}`}</span></div><em>{bridgeStatus.current?"已同步":bridgeStatus.status==="offline"?"当前离线":`缺少 ${bridgeStatus.missingCapabilities.length} 项能力`}</em><footer>{bridgeStatus.current?"MuseTalk 与 MoneyPrinterTurbo 新预检已在运行中":"旧服务仍健康，但不会显示新增预检；请在方便时重启知绘本机操作台"}<span>自动重启 {bridgeStatus.restartTriggered?"已触发":"0"} · 进程改动 {bridgeStatus.processMutation?"已发生":"0"}</span></footer></section>
        <h3 className="subhead">生产前检查</h3>
        {preflight.verificationNotice&&<p className="verificationNotice">{preflight.verificationNotice}</p>}
        {preflight.stages.length ? <div className="preflightGrid">{preflight.stages.map(stage=><div className={stage.ready?"preflight ready":"preflight blocked"} key={stage.id}><span>{stage.ready?"✓":"!"}</span><div><b>{stage.label}</b><small>{stage.detail}</small>{stage.action&&<p>{stage.action}</p>}</div><em>{stage.verification==="verified"?"本机已验证":stage.ready?"配置完整 · 未测试":stage.required?"阻塞生产":"等待授权"}</em></div>)}</div>:<div className="preflightEmpty"><b>当前为云端规划模式</b><span>{preflight.message}</span></div>}
        {preflight.settingsUrl&&<a className="configLink" href={preflight.settingsUrl} target="_blank">打开本机 AI 配置 →</a>}
        <h3 className="subhead">发布账号</h3>
        <div className="accountGrid">{accounts.map(account=>{const p=platformMeta[account.platform as keyof typeof platformMeta];return <div className="account" key={account.platform}><span style={{background:p?.color}}>{p?.name.slice(0,1)}</span><div><b>{p?.name}</b><small>{account.publishMode}</small></div><em>{account.status==="connected"?account.handle:"需要本人授权"}</em><button disabled>准备授权</button></div>})}</div>
        <h3 className="subhead">电脑上的开源引擎</h3>
        {moneyPrinter?.contentPreflight&&<section className="moneyPrinterPreflight"><header><div><small>MONEYPRINTERTURBO · 资讯口播备选</small><b>只读预检 · 未抓新闻、未下载素材</b></div><em>{moneyPrinter.contentPreflight.readyForProduction?"生产条件已验证":"当前不可生产"}</em></header><div><span><b>配置边界</b>{moneyPrinter.contentPreflight.engine.configurationPresent?"文件存在但未读取密钥":"配置文件不存在"}</span><span><b>运行环境</b>Python {moneyPrinter.contentPreflight.runtime.documentedPython} · 独立环境{moneyPrinter.contentPreflight.runtime.dedicatedEnvPresent?"已有":"未创建"}</span><span><b>素材版权</b>默认音乐 {moneyPrinter.contentPreflight.sourcePolicy.bundledMusicCount} 项 · 未核权前全部禁用</span><span><b>事实边界</b>只能使用已审核来源起草，不能自行确立新闻事实</span></div><footer>{moneyPrinter.contentPreflight.nextAction}<em>抓取 0 · 素材下载 0 · 成片 0 · 发布 0</em></footer></section>}
        {museTalk?.lipSyncPreflight&&<section className="museTalkPreflight"><header><div><small>MUSETALK · 数字人口型备选</small><b>只读预检 · 未下载、未推理</b></div><em>{museTalk.lipSyncPreflight.readyForSmokeTest?"具备烟雾测试候选条件":"尚未具备测试条件"}</em></header><div><span><b>显卡</b>{museTalk.lipSyncPreflight.hardware.gpuName} · {museTalk.lipSyncPreflight.hardware.gpuMemoryGiB}GB</span><span><b>模型文件</b>{museTalk.lipSyncPreflight.model.presentModelFiles}/{museTalk.lipSyncPreflight.model.requiredModelFiles} · 体积未在本机文档中核实</span><span><b>独立环境</b>Python {museTalk.lipSyncPreflight.runtime.recommendedPython} · {museTalk.lipSyncPreflight.runtime.dedicatedEnvPresent?"已存在":"未创建"}</span><span><b>路线定位</b>科普漫剧默认不启用；仅在明确选择数字人口播时使用</span></div><footer>{museTalk.lipSyncPreflight.nextAction}<em>下载 0 · 推理 0 · 成片 0 · 费用 0</em></footer></section>}
        {localEngineRows.length?<div className="engineList">{localEngineRows.map(row=><div key={row.id} className={row.installPreflight||row.configuration?"withInstallPreflight":""}><span className={row.ready?"ready":"waiting"}/><b>{row.name}</b><small>{row.role}</small><p>{row.detail}<em>{row.action}</em></p>{row.url?<a href={row.url} target="_blank">打开本机工具</a>:<strong>{row.status === "model_weights_missing"?"缺少模型权重":row.status === "missing_required_credential"?"缺基础模型授权":row.status === "configured_unverified"?"已配置 · 未验证":row.status === "external_configuration_required"?"等待模型授权":row.ready?"已就绪":"不可用"}</strong>}{row.configuration&&<section className="installPreflight"><b>配置诊断 · 未调用模型</b>{row.configuration.routes.map(route=><span key={route.id}>{route.requiredForPilot?"必需":"可选"} · {route.label}：{route.configured?"已配置":"未配置"}</span>)}<em>{row.configuration.nextAction}</em></section>}{row.installPreflight&&<section className="installPreflight"><b>安装预检 · 未执行下载</b><span>{row.installPreflight.hardware.gpuName} · {row.installPreflight.hardware.gpuMemoryGiB}GB 显存</span><span>C 盘可用 {row.installPreflight.disk.freeGiB}GB · 安全预留 {row.installPreflight.disk.requiredFreeGiB}GB</span><span>官方模型约 {row.installPreflight.model.reportedGiB}GiB · Python {row.installPreflight.runtime.recommendedPython} 独立环境：{row.installPreflight.runtime.dedicatedEnvPresent?"已有":"未创建"}</span><span>安装计划：{row.installPreflight.planAvailable?"已准备 · 默认不执行":"未准备"}</span><span>一句话验收：{row.installPreflight.smokePlanAvailable?"已准备 · 仅作烟雾测试":"未准备"}</span><em>{row.installPreflight.nextAction}</em><a href={row.installPreflight.model.sourceUrl} target="_blank" rel="noreferrer">查看官方模型文件 →</a></section>}</div>)}</div>:<div className="preflightEmpty"><b>仅在本机检查</b><span>启动本机操作台后显示代码与模型文件状态。</span></div>}
        <div className="credentials"><b>还需要你提供什么？</b><p>至少选择一个文本/图片/视频服务商的API Key；创建抖音开放平台应用和TikTok开发者应用；小红书使用官方分享流程。密钥只写入受保护的运行环境，不放进网页或Git。</p></div>
      </section>}
    </section>
  </main>;
}
