"use client";

import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  Users,
  Vote
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SCORE_WEIGHTS, PRESET_WEIGHTS } from "@/domain/config";
import { mean, updateLedger } from "@/domain/scoring";
import type {
  ActivityType,
  BurdenLedger,
  MeetingCandidate,
  MeetingState,
  ParticipantInput,
  RecommendationResponse,
  ScoringPreset,
  VenueOption,
  VoteInput
} from "@/domain/types";
import { assertTransition } from "@/domain/voting";
import { castVote, tallyVotes } from "@/domain/voting";

type FriendStatus = "invited" | "accepted" | "inactive";

interface FriendRecord {
  id: string;
  localAlias: string;
  displayName: string | null;
  status: FriendStatus;
  active: boolean;
  order: number;
  defaultLocationKey: keyof typeof LOCATION_PRESETS;
  returnLocationKey: keyof typeof LOCATION_PRESETS;
  maxTravelMinutes: number;
  maxTransfers: number;
  maxWalkMinutes: number;
  activityLikes: ActivityType[];
  needsElevator: boolean;
}

interface GroupRecord {
  id: string;
  name: string;
  memberFriendIds: string[];
  defaultPreset: ScoringPreset;
  ledger: Record<string, number>;
  recentHubs: string[];
  defaultTimeLabel: string;
}

interface MeetingRecord {
  id: string;
  title: string;
  groupId: string | null;
  state: MeetingState;
  startsAt: string;
  expectedEndsAt: string;
  activityTypes: ActivityType[];
  preset: ScoringPreset;
  candidateCount: number;
  revision: number;
  votingDeadline: string;
  participants: ParticipantInput[];
  candidates: MeetingCandidate[];
  votes: VoteInput[];
  lockedCandidateId: string | null;
  venues: VenueOption[];
  selectedVenueId: string | null;
  inviteToken: string;
  demoData: boolean;
  warnings: string[];
  relaxationMessage: string | null;
}

interface AppState {
  profileName: string;
  friends: FriendRecord[];
  groups: GroupRecord[];
  meetings: MeetingRecord[];
  activeMeetingId: string | null;
  ledgerHistory: BurdenLedger[];
  demoLoaded: boolean;
}

type TabKey =
  | "home"
  | "friends"
  | "groups"
  | "meeting"
  | "participants"
  | "results"
  | "vote"
  | "ledger"
  | "settings";

const STORAGE_KEY = "fairturn:v1";

const LOCATION_PRESETS = {
  seongnam: { label: "성남", address: "경기 성남시 분당구", coordinate: { lat: 37.3826, lng: 127.1189 } },
  bucheon: { label: "부천", address: "경기 부천시", coordinate: { lat: 37.5035, lng: 126.766 } },
  sinchon: { label: "신촌", address: "서울 서대문구 신촌", coordinate: { lat: 37.5598, lng: 126.9424 } },
  gwangmyeong: { label: "광명", address: "경기 광명시", coordinate: { lat: 37.4786, lng: 126.8646 } },
  suwon: { label: "수원", address: "경기 수원시", coordinate: { lat: 37.2636, lng: 127.0286 } },
  gimpo: { label: "김포", address: "경기 김포시", coordinate: { lat: 37.6152, lng: 126.7156 } }
} as const;

const ACTIVITY_OPTIONS: Array<{ id: ActivityType; label: string }> = [
  { id: "meal", label: "식사" },
  { id: "cafe", label: "카페" },
  { id: "drinks", label: "술" },
  { id: "movie", label: "영화" },
  { id: "exhibition", label: "전시" },
  { id: "shopping", label: "쇼핑" },
  { id: "performance", label: "공연" },
  { id: "walk", label: "산책" },
  { id: "board_game", label: "보드게임" },
  { id: "experience", label: "체험" },
  { id: "sports", label: "스포츠" }
];

const PRESET_LABELS: Record<ScoringPreset, string> = {
  balanced: "균형 우선",
  time_first: "이동시간 우선",
  hub_first: "놀기 좋은 지역 우선",
  late_return: "늦은 귀가 우선",
  fare_first: "교통비 우선",
  accessibility_first: "접근성 우선"
};

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function initialState(): AppState {
  return {
    profileName: "지환",
    friends: [],
    groups: [],
    meetings: [],
    activeMeetingId: null,
    ledgerHistory: [],
    demoLoaded: false
  };
}

function displayFriendName(friend: FriendRecord) {
  return friend.status === "accepted" && friend.displayName ? friend.displayName : friend.localAlias;
}

function buildParticipant(friend: FriendRecord, group: GroupRecord | null): ParticipantInput {
  const origin = LOCATION_PRESETS[friend.defaultLocationKey];
  const returnLocation = LOCATION_PRESETS[friend.returnLocationKey];
  return {
    id: friend.id,
    displayName: displayFriendName(friend),
    friendId: friend.id,
    profileId: friend.status === "accepted" ? `profile_${friend.id}` : null,
    coarseOriginLabel: origin.label,
    origin,
    returnLocation,
    availableFrom: "",
    desiredArrival: "",
    expectedReturnStart: "",
    mode: "transit",
    constraints: {
      maxTravelMinutes: friend.maxTravelMinutes,
      maxTransfers: friend.maxTransfers,
      maxWalkMinutes: friend.maxWalkMinutes,
      maxFareWon: 9000,
      minLastTransitBufferMinutes: 20,
      avoidStairs: false,
      avoidSlopes: false,
      needsElevator: friend.needsElevator,
      wheelchairAccess: false,
      unavailableModes: []
    },
    preferences: {
      activityLikes: friend.activityLikes,
      activityDislikes: [],
      placeCategoryLikes: ["식당", "카페"],
      crowdingAvoidance: 2
    },
    oldLedger: group?.ledger[friend.id] ?? 0,
    exactLocationConsent: false
  };
}

function loadState(): AppState {
  if (typeof window === "undefined") return initialState();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return initialState();
  try {
    return JSON.parse(raw) as AppState;
  } catch {
    return initialState();
  }
}

function persistState(state: AppState) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

function StateBadge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  return <span className={`state-badge ${tone}`}>{label}</span>;
}

function IconButton({
  label,
  children,
  onClick,
  disabled = false
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function FairTurnApp() {
  const [state, setState] = useState<AppState>(() => initialState());
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState("대학 친구");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<string>("확인 전");
  const [voteParticipantId, setVoteParticipantId] = useState("");
  const [voteCandidateId, setVoteCandidateId] = useState("");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) persistState(state);
  }, [hydrated, state]);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const activeMeeting = useMemo(
    () => state.meetings.find((meeting) => meeting.id === state.activeMeetingId) ?? state.meetings[0] ?? null,
    [state.activeMeetingId, state.meetings]
  );
  const activeGroup = useMemo(
    () => state.groups.find((group) => group.id === activeMeeting?.groupId) ?? state.groups[0] ?? null,
    [activeMeeting?.groupId, state.groups]
  );
  const duplicateFriendNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const friend of state.friends.filter((friend) => friend.active)) {
      const key = displayFriendName(friend).trim();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  }, [state.friends]);

  function updateState(updater: (previous: AppState) => AppState) {
    setState((previous) => updater(previous));
  }

  function addFriend() {
    updateState((previous) => {
      const nextNumber = previous.friends.length + 1;
      const friend: FriendRecord = {
        id: createId("friend"),
        localAlias: `친구 ${nextNumber}`,
        displayName: null,
        status: "invited",
        active: true,
        order: previous.friends.length,
        defaultLocationKey: ["seongnam", "bucheon", "sinchon", "gwangmyeong"][previous.friends.length % 4] as keyof typeof LOCATION_PRESETS,
        returnLocationKey: ["seongnam", "bucheon", "sinchon", "gwangmyeong"][previous.friends.length % 4] as keyof typeof LOCATION_PRESETS,
        maxTravelMinutes: 75,
        maxTransfers: 3,
        maxWalkMinutes: 20,
        activityLikes: ["meal", "cafe"],
        needsElevator: false
      };
      return { ...previous, friends: [...previous.friends, friend] };
    });
    setActiveTab("friends");
  }

  function updateFriend(friendId: string, patch: Partial<FriendRecord>) {
    updateState((previous) => ({
      ...previous,
      friends: previous.friends.map((friend) => (friend.id === friendId ? { ...friend, ...patch } : friend))
    }));
  }

  function moveFriend(friendId: string, direction: -1 | 1) {
    updateState((previous) => {
      const friends = [...previous.friends].sort((a, b) => a.order - b.order);
      const index = friends.findIndex((friend) => friend.id === friendId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= friends.length) return previous;
      [friends[index], friends[target]] = [friends[target], friends[index]];
      return { ...previous, friends: friends.map((friend, order) => ({ ...friend, order })) };
    });
  }

  function createGroup() {
    const memberIds = selectedFriendIds.length > 0 ? selectedFriendIds : state.friends.filter((friend) => friend.active).slice(0, 4).map((friend) => friend.id);
    const group: GroupRecord = {
      id: createId("group"),
      name: newGroupName.trim() || "새 그룹",
      memberFriendIds: memberIds,
      defaultPreset: "balanced",
      ledger: Object.fromEntries(memberIds.map((id) => [id, 0])),
      recentHubs: [],
      defaultTimeLabel: "평일 저녁"
    };
    updateState((previous) => ({ ...previous, groups: [...previous.groups, group] }));
    setActiveTab("groups");
  }

  function createMeetingFromGroup(group = activeGroup) {
    const targetGroup = group ?? null;
    const friends = targetGroup
      ? state.friends.filter((friend) => targetGroup.memberFriendIds.includes(friend.id) && friend.active)
      : state.friends.filter((friend) => friend.active).slice(0, 4);
    const meeting: MeetingRecord = {
      id: createId("meeting"),
      title: "금요일 저녁 약속",
      groupId: targetGroup?.id ?? null,
      state: "collecting",
      startsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString().slice(0, 16),
      expectedEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3 + 1000 * 60 * 60 * 3).toISOString().slice(0, 16),
      activityTypes: ["meal", "cafe"],
      preset: targetGroup?.defaultPreset ?? "balanced",
      candidateCount: 4,
      revision: 1,
      votingDeadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString().slice(0, 16),
      participants: friends.map((friend) => buildParticipant(friend, targetGroup)),
      candidates: [],
      votes: [],
      lockedCandidateId: null,
      venues: [],
      selectedVenueId: null,
      inviteToken: createId("invite"),
      demoData: true,
      warnings: [],
      relaxationMessage: null
    };
    updateState((previous) => ({
      ...previous,
      meetings: [...previous.meetings, meeting],
      activeMeetingId: meeting.id
    }));
    setActiveTab("participants");
  }

  function loadDemo() {
    const friends: FriendRecord[] = [
      ["서연", "seongnam", ["meal", "cafe"], 70, 2],
      ["민준", "bucheon", ["drinks", "meal"], 80, 3],
      ["하린", "sinchon", ["exhibition", "cafe"], 65, 2],
      ["지환", "gwangmyeong", ["meal", "movie"], 75, 3]
    ].map(([name, location, likes, maxTravel, maxTransfers], index) => ({
      id: `demo_friend_${index + 1}`,
      localAlias: String(name),
      displayName: index === 0 ? "서연" : null,
      status: index === 0 ? "accepted" : "invited",
      active: true,
      order: index,
      defaultLocationKey: location as keyof typeof LOCATION_PRESETS,
      returnLocationKey: location as keyof typeof LOCATION_PRESETS,
      maxTravelMinutes: Number(maxTravel),
      maxTransfers: Number(maxTransfers),
      maxWalkMinutes: index === 0 ? 14 : 20,
      activityLikes: likes as ActivityType[],
      needsElevator: index === 0
    }));
    const group: GroupRecord = {
      id: "demo_group_1",
      name: "대학 친구",
      memberFriendIds: friends.map((friend) => friend.id),
      defaultPreset: "balanced",
      ledger: {
        demo_friend_1: 24,
        demo_friend_2: -8,
        demo_friend_3: -4,
        demo_friend_4: -12
      },
      recentHubs: ["홍대입구", "강남역"],
      defaultTimeLabel: "금요일 저녁"
    };
    const meeting: MeetingRecord = {
      id: "demo_meeting_1",
      title: "금요일 저녁 약속",
      groupId: group.id,
      state: "collecting",
      startsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString().slice(0, 16),
      expectedEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3 + 1000 * 60 * 60 * 3).toISOString().slice(0, 16),
      activityTypes: ["meal", "cafe", "drinks"],
      preset: "balanced",
      candidateCount: 4,
      revision: 1,
      votingDeadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString().slice(0, 16),
      participants: friends.map((friend) => buildParticipant(friend, group)),
      candidates: [],
      votes: [],
      lockedCandidateId: null,
      venues: [],
      selectedVenueId: null,
      inviteToken: "demo-invite-token",
      demoData: true,
      warnings: ["데모 데이터로 시작했습니다. 계산 결과도 명시적 Fixture Provider를 사용합니다."],
      relaxationMessage: null
    };
    setState({
      profileName: "지환",
      friends,
      groups: [group],
      meetings: [meeting],
      activeMeetingId: meeting.id,
      ledgerHistory: [],
      demoLoaded: true
    });
    setActiveTab("meeting");
  }

  function updateMeeting(patch: Partial<MeetingRecord>) {
    if (!activeMeeting) return;
    updateState((previous) => ({
      ...previous,
      meetings: previous.meetings.map((meeting) => (meeting.id === activeMeeting.id ? { ...meeting, ...patch } : meeting))
    }));
  }

  function updateParticipant(participantId: string, patch: Partial<ParticipantInput>) {
    if (!activeMeeting) return;
    updateMeeting({
      participants: activeMeeting.participants.map((participant) =>
        participant.id === participantId ? { ...participant, ...patch } : participant
      ),
      revision: activeMeeting.revision + 1,
      candidates: [],
      votes: [],
      warnings: ["참여자 조건이 변경되어 계산 revision이 올라갔고 기존 투표는 초기화되었습니다."]
    });
  }

  function addGuestParticipant() {
    if (!activeMeeting) return;
    const guestFriend: FriendRecord = {
      id: createId("guest"),
      localAlias: `비회원 ${activeMeeting.participants.length + 1}`,
      displayName: null,
      status: "invited",
      active: true,
      order: activeMeeting.participants.length,
      defaultLocationKey: "suwon",
      returnLocationKey: "suwon",
      maxTravelMinutes: 85,
      maxTransfers: 3,
      maxWalkMinutes: 20,
      activityLikes: ["meal"],
      needsElevator: false
    };
    updateMeeting({
      participants: [...activeMeeting.participants, buildParticipant(guestFriend, activeGroup)],
      revision: activeMeeting.revision + 1,
      state: "collecting",
      warnings: ["비회원 참여자는 이 모임에만 사용되며 데모 상태에서는 브라우저 localStorage에만 저장됩니다."]
    });
  }

  async function calculate() {
    if (!activeMeeting) return;
    setLoading(true);
    setError(null);
    updateMeeting({ state: assertTransition(activeMeeting.state, "calculating") });
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId: activeMeeting.id,
          revision: activeMeeting.revision,
          startsAt: activeMeeting.startsAt,
          expectedEndsAt: activeMeeting.expectedEndsAt,
          activityTypes: activeMeeting.activityTypes,
          candidateCount: activeMeeting.candidateCount,
          preset: activeMeeting.preset,
          weights: PRESET_WEIGHTS[activeMeeting.preset] ?? DEFAULT_SCORE_WEIGHTS,
          participants: activeMeeting.participants,
          providerMode: "fixture"
        })
      });
      const result = (await response.json()) as RecommendationResponse;
      if (!result.ok) {
        updateMeeting({
          state: "calculation_failed",
          candidates: [],
          warnings: [...result.validationWarnings, ...result.providerWarnings],
          relaxationMessage: result.relaxation?.message ?? null
        });
        setActiveTab("results");
        return;
      }
      updateMeeting({
        state: "voting",
        candidates: result.candidates,
        demoData: result.demoData,
        warnings: [...result.validationWarnings, ...result.providerWarnings],
        relaxationMessage: result.relaxation?.message ?? null
      });
      setVoteParticipantId(result.candidates[0]?.burdens[0]?.participantId ?? "");
      setVoteCandidateId(result.candidates[0]?.id ?? "");
      setActiveTab("results");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "추천 계산 중 오류가 발생했습니다.";
      setError(message);
      updateMeeting({ state: "calculation_failed", warnings: [message] });
    } finally {
      setLoading(false);
    }
  }

  function voteForCandidate() {
    if (!activeMeeting || !voteParticipantId || !voteCandidateId) return;
    try {
      const votes = castVote(
        activeMeeting.votes,
        {
          meetingId: activeMeeting.id,
          revision: activeMeeting.revision,
          participantId: voteParticipantId,
          candidateId: voteCandidateId,
          createdAt: new Date().toISOString()
        },
        {
          anonymous: false,
          changeAllowed: true,
          deadline: activeMeeting.votingDeadline ? new Date(activeMeeting.votingDeadline).toISOString() : null,
          autoTieBreak: true
        }
      );
      updateMeeting({ votes });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "투표 실패");
    }
  }

  async function lockRegion(candidateId?: string) {
    if (!activeMeeting) return;
    const tally = tallyVotes({
      candidates: activeMeeting.candidates,
      participantIds: activeMeeting.participants.map((participant) => participant.id),
      votes: activeMeeting.votes,
      revision: activeMeeting.revision,
      settings: {
        anonymous: false,
        changeAllowed: true,
        deadline: activeMeeting.votingDeadline ? new Date(activeMeeting.votingDeadline).toISOString() : null,
        autoTieBreak: true
      }
    });
    const targetId = candidateId ?? tally.winningCandidateId ?? activeMeeting.candidates[0]?.id ?? null;
    const candidate = activeMeeting.candidates.find((item) => item.id === targetId);
    if (!candidate || !targetId) return;
    let venues: VenueOption[] = [];
    try {
      const response = await fetch("/api/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate, categories: ["식당", "카페", "술집", "영화관"] })
      });
      venues = ((await response.json()) as { venues: VenueOption[] }).venues;
    } catch {
      venues = [];
    }
    updateMeeting({
      state: "region_locked",
      lockedCandidateId: targetId,
      venues,
      warnings: [...activeMeeting.warnings, tally.reason]
    });
    setActiveTab("vote");
  }

  function confirmVenue(venueId: string) {
    if (!activeMeeting) return;
    updateMeeting({
      state: "confirmed",
      selectedVenueId: venueId,
      warnings: [...activeMeeting.warnings, "최종 장소가 확정되었습니다."]
    });
  }

  function completeMeeting() {
    if (!activeMeeting || !activeGroup) return;
    const candidate = activeMeeting.candidates.find((item) => item.id === activeMeeting.lockedCandidateId);
    if (!candidate) return;
    const burdens = candidate.burdens.filter((burden) => burden.total !== null);
    const groupMean = mean(burdens.map((burden) => burden.total ?? 0));
    const ledger = { ...activeGroup.ledger };
    for (const burden of burdens) {
      ledger[burden.participantId] = updateLedger(ledger[burden.participantId] ?? 0, burden.total ?? 0, groupMean);
    }
    updateState((previous) => ({
      ...previous,
      groups: previous.groups.map((group) =>
        group.id === activeGroup.id
          ? {
              ...group,
              ledger,
              recentHubs: [candidate.hub.displayName, ...group.recentHubs.filter((hub) => hub !== candidate.hub.displayName)].slice(0, 5)
            }
          : group
      ),
      meetings: previous.meetings.map((meeting) =>
        meeting.id === activeMeeting.id ? { ...meeting, state: "completed", warnings: [...meeting.warnings, "실제 참석자 기준으로 누적 장부를 반영했습니다."] } : meeting
      )
    }));
    setActiveTab("ledger");
  }

  async function checkProviders() {
    setProviderStatus("확인 중");
    const response = await fetch("/api/provider-status");
    const body = await response.json() as { providerMode: string; transit: { warning: string | null; configured: boolean }; place: { warning: string | null; configured: boolean } };
    setProviderStatus(`${body.providerMode} / transit:${body.transit.configured ? "configured" : "missing"} / place:${body.place.configured ? "configured" : "missing"} / ${body.transit.warning ?? "정상"}`);
  }

  const voteResult = activeMeeting
    ? tallyVotes({
        candidates: activeMeeting.candidates,
        participantIds: activeMeeting.participants.map((participant) => participant.id),
        votes: activeMeeting.votes,
        revision: activeMeeting.revision,
        settings: {
          anonymous: false,
          changeAllowed: true,
          deadline: activeMeeting.votingDeadline ? new Date(activeMeeting.votingDeadline).toISOString() : null,
          autoTieBreak: true
        }
      })
    : null;

  const lockedCandidate = activeMeeting?.candidates.find((candidate) => candidate.id === activeMeeting.lockedCandidateId) ?? null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">FairTurn</p>
          <h1>만날 장소, 번갈아가며 공평하게</h1>
        </div>
        <div className="status-strip" aria-live="polite">
          <StateBadge label={offline ? "오프라인" : "온라인"} tone={offline ? "bad" : "good"} />
          <StateBadge label={activeMeeting ? activeMeeting.state : "빈 상태"} tone={activeMeeting?.state === "calculation_failed" ? "bad" : "neutral"} />
          {activeMeeting?.demoData ? <StateBadge label="데모 데이터" tone="warn" /> : null}
          {activeMeeting ? <StateBadge label={`revision ${activeMeeting.revision}`} /> : null}
        </div>
      </header>

      <nav className="tabs" aria-label="FairTurn 주요 화면">
        {[
          ["home", "홈"],
          ["friends", "친구"],
          ["groups", "그룹"],
          ["meeting", "모임"],
          ["participants", "입력/초대"],
          ["results", "후보"],
          ["vote", "투표/장소"],
          ["ledger", "기록"],
          ["settings", "설정/API"]
        ].map(([key, label]) => (
          <button key={key} type="button" className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key as TabKey)}>
            {label}
          </button>
        ))}
      </nav>

      {error ? (
        <section className="notice bad" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>닫기</button>
        </section>
      ) : null}

      {activeTab === "home" ? (
        <section className="screen two-col">
          <div className="hero-panel">
            <p className="eyebrow">여러 번 만날수록 더 공평해지는 약속</p>
            <h2>이번엔 가까운 쪽, 다음엔 먼 쪽이 덜 가게.</h2>
            <p>
              중간 지점이 아니라, 실제로 모이기 쉬운 역·상권에서 고릅니다. 지난 만남의 이동 부담도 같이 봅니다.
            </p>
            <div className="actions">
              <button type="button" className="primary" onClick={loadDemo}>
                <Activity size={18} /> 4인 데모 불러오기
              </button>
              <button type="button" onClick={addFriend}>
                <Plus size={18} /> 친구 추가
              </button>
            </div>
          </div>
          <div className="panel">
            <h3>현재 상태</h3>
            <ul className="metric-list">
              <li><span>친구</span><strong>{state.friends.filter((friend) => friend.active).length}명</strong></li>
              <li><span>그룹</span><strong>{state.groups.length}개</strong></li>
              <li><span>모임</span><strong>{state.meetings.length}개</strong></li>
              <li><span>공유 위치 정책</span><strong>정확 좌표 비공개</strong></li>
            </ul>
          </div>
        </section>
      ) : null}

      {activeTab === "friends" ? (
        <section className="screen">
          <div className="section-header">
            <div>
              <p className="eyebrow">친구 관리</p>
              <h2>내가 부르는 이름과 친구가 쓰는 이름을 나눠 둡니다.</h2>
            </div>
            <button type="button" className="primary" onClick={addFriend}><Plus size={18} /> 친구 추가</button>
          </div>
          {duplicateFriendNames.length > 0 ? <div className="notice warn">중복 친구 이름 감지: {duplicateFriendNames.join(", ")}</div> : null}
          {state.friends.length === 0 ? <div className="empty">아직 친구가 없습니다. 친구를 추가하면 자동으로 `친구 1` 이름이 붙습니다.</div> : null}
          <div className="list">
            {[...state.friends].sort((a, b) => a.order - b.order).map((friend) => (
              <article className="row-item" key={friend.id}>
                <div>
                  <label>개인 별명</label>
                  <input value={friend.localAlias} onChange={(event) => updateFriend(friend.id, { localAlias: event.target.value })} />
                </div>
                <div>
                  <label>본인 표시 이름</label>
                  <input value={friend.displayName ?? ""} placeholder="초대 수락 후 설정" onChange={(event) => updateFriend(friend.id, { displayName: event.target.value || null, status: event.target.value ? "accepted" : friend.status })} />
                </div>
                <div>
                  <label>출발 권역</label>
                  <select value={friend.defaultLocationKey} onChange={(event) => updateFriend(friend.id, { defaultLocationKey: event.target.value as keyof typeof LOCATION_PRESETS })}>
                    {Object.entries(LOCATION_PRESETS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
                  </select>
                </div>
                <div>
                  <label>최대 이동/환승/도보</label>
                  <div className="inline-inputs">
                    <input type="number" value={friend.maxTravelMinutes} onChange={(event) => updateFriend(friend.id, { maxTravelMinutes: Number(event.target.value) })} aria-label="최대 이동시간" />
                    <input type="number" value={friend.maxTransfers} onChange={(event) => updateFriend(friend.id, { maxTransfers: Number(event.target.value) })} aria-label="최대 환승" />
                    <input type="number" value={friend.maxWalkMinutes} onChange={(event) => updateFriend(friend.id, { maxWalkMinutes: Number(event.target.value) })} aria-label="최대 도보" />
                  </div>
                </div>
                <div className="row-actions">
                  <IconButton label="위로 이동" onClick={() => moveFriend(friend.id, -1)}><ChevronUp size={18} /></IconButton>
                  <IconButton label="아래로 이동" onClick={() => moveFriend(friend.id, 1)}><ChevronDown size={18} /></IconButton>
                  <IconButton label="활성 목록에서 제거" onClick={() => updateFriend(friend.id, { active: false, status: "inactive" })}><Trash2 size={18} /></IconButton>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "groups" ? (
        <section className="screen">
          <div className="section-header">
            <div>
              <p className="eyebrow">그룹</p>
              <h2>그룹마다 누가 많이 움직였는지 따로 쌓입니다.</h2>
            </div>
          </div>
          <div className="panel form-grid">
            <label>그룹명<input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} /></label>
            <div>
              <span className="label">멤버</span>
              <div className="chip-grid">
                {state.friends.filter((friend) => friend.active).map((friend) => (
                  <label className="check-chip" key={friend.id}>
                    <input type="checkbox" checked={selectedFriendIds.includes(friend.id)} onChange={(event) => setSelectedFriendIds((ids) => event.target.checked ? [...ids, friend.id] : ids.filter((id) => id !== friend.id))} />
                    {displayFriendName(friend)}
                  </label>
                ))}
              </div>
            </div>
            <button type="button" className="primary" onClick={createGroup}><Save size={18} /> 그룹 저장</button>
          </div>
          <div className="list compact">
            {state.groups.map((group) => (
              <article className="panel" key={group.id}>
                <div className="section-header small">
                  <h3>{group.name}</h3>
                  <button type="button" onClick={() => createMeetingFromGroup(group)}>이 그룹으로 모임 만들기</button>
                </div>
                <p>멤버 {group.memberFriendIds.length}명 · 기본 프리셋 {PRESET_LABELS[group.defaultPreset]} · 최근 허브 {group.recentHubs.join(", ") || "없음"}</p>
                <LedgerBars ledger={group.ledger} friends={state.friends} />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "meeting" ? (
        <section className="screen two-col">
          <div className="panel">
            <div className="section-header small">
              <h2>새 모임 만들기</h2>
              <button type="button" className="primary" onClick={() => createMeetingFromGroup()} disabled={state.friends.filter((friend) => friend.active).length < 2}>
                <Plus size={18} /> 모임 생성
              </button>
            </div>
            {activeMeeting ? (
              <div className="form-grid">
                <label>제목<input value={activeMeeting.title} onChange={(event) => updateMeeting({ title: event.target.value })} /></label>
                <label>시작시각<input type="datetime-local" value={activeMeeting.startsAt} onChange={(event) => updateMeeting({ startsAt: event.target.value, revision: activeMeeting.revision + 1 })} /></label>
                <label>예상 종료<input type="datetime-local" value={activeMeeting.expectedEndsAt} onChange={(event) => updateMeeting({ expectedEndsAt: event.target.value, revision: activeMeeting.revision + 1 })} /></label>
                <label>투표 마감<input type="datetime-local" value={activeMeeting.votingDeadline} onChange={(event) => updateMeeting({ votingDeadline: event.target.value })} /></label>
                <label>추천 프리셋
                  <select value={activeMeeting.preset} onChange={(event) => updateMeeting({ preset: event.target.value as ScoringPreset, revision: activeMeeting.revision + 1 })}>
                    {Object.entries(PRESET_LABELS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
                  </select>
                </label>
                <label>후보 개수<input type="number" min={3} max={4} value={activeMeeting.candidateCount} onChange={(event) => updateMeeting({ candidateCount: Number(event.target.value) })} /></label>
                <div>
                  <span className="label">활동</span>
                  <div className="chip-grid">
                    {ACTIVITY_OPTIONS.map((activity) => (
                      <label className="check-chip" key={activity.id}>
                        <input type="checkbox" checked={activeMeeting.activityTypes.includes(activity.id)} onChange={(event) => updateMeeting({ activityTypes: event.target.checked ? [...activeMeeting.activityTypes, activity.id] : activeMeeting.activityTypes.filter((id) => id !== activity.id), revision: activeMeeting.revision + 1 })} />
                        {activity.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : <div className="empty">모임이 없습니다. 친구 2명 이상을 만든 뒤 모임을 생성하세요.</div>}
          </div>
          <StatusPanel meeting={activeMeeting} warnings={activeMeeting?.warnings ?? []} />
        </section>
      ) : null}

      {activeTab === "participants" ? (
        <section className="screen">
          <div className="section-header">
            <div>
              <p className="eyebrow">참여자별 비공개 입력</p>
              <h2>정확한 주소는 친구에게 공유되지 않습니다.</h2>
            </div>
            <div className="actions">
              <button type="button" onClick={addGuestParticipant}><Users size={18} /> 비회원 추가</button>
              <button type="button" className="primary" onClick={calculate} disabled={!activeMeeting || activeMeeting.participants.length < 2 || loading}>
                <RefreshCw size={18} /> {loading ? "계산 중" : "후보 계산"}
              </button>
            </div>
          </div>
          {activeMeeting ? (
            <>
              <div className="notice">
                <Copy size={18} /> 초대 링크: <code>{`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${activeMeeting.inviteToken}`}</code>
              </div>
              <div className="list">
                {activeMeeting.participants.map((participant) => (
                  <article className="row-item participant" key={participant.id}>
                    <div>
                      <label>이름<input value={participant.displayName} onChange={(event) => updateParticipant(participant.id, { displayName: event.target.value })} /></label>
                      <span className="hint">공유 표시: {participant.coarseOriginLabel}</span>
                    </div>
                    <label>출발지
                      <select value={locationKeyByLabel(participant.origin.label)} onChange={(event) => {
                        const location = LOCATION_PRESETS[event.target.value as keyof typeof LOCATION_PRESETS];
                        updateParticipant(participant.id, { origin: location, coarseOriginLabel: location.label });
                      }}>
                        {Object.entries(LOCATION_PRESETS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
                      </select>
                    </label>
                    <label>귀가지
                      <select value={locationKeyByLabel(participant.returnLocation.label)} onChange={(event) => updateParticipant(participant.id, { returnLocation: LOCATION_PRESETS[event.target.value as keyof typeof LOCATION_PRESETS] })}>
                        {Object.entries(LOCATION_PRESETS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
                      </select>
                    </label>
                    <div>
                      <label>최대 이동/환승/도보</label>
                      <div className="inline-inputs">
                        <input type="number" value={participant.constraints.maxTravelMinutes ?? 90} onChange={(event) => updateParticipant(participant.id, { constraints: { ...participant.constraints, maxTravelMinutes: Number(event.target.value) } })} aria-label="최대 이동시간" />
                        <input type="number" value={participant.constraints.maxTransfers ?? 3} onChange={(event) => updateParticipant(participant.id, { constraints: { ...participant.constraints, maxTransfers: Number(event.target.value) } })} aria-label="최대 환승" />
                        <input type="number" value={participant.constraints.maxWalkMinutes ?? 20} onChange={(event) => updateParticipant(participant.id, { constraints: { ...participant.constraints, maxWalkMinutes: Number(event.target.value) } })} aria-label="최대 도보시간" />
                      </div>
                    </div>
                    <label className="check-line">
                      <input type="checkbox" checked={participant.constraints.needsElevator ?? false} onChange={(event) => updateParticipant(participant.id, { constraints: { ...participant.constraints, needsElevator: event.target.checked } })} />
                      엘리베이터 필요
                    </label>
                  </article>
                ))}
              </div>
            </>
          ) : <div className="empty">활성 모임이 없습니다.</div>}
        </section>
      ) : null}

      {activeTab === "results" ? (
        <section className="screen">
          <div className="section-header">
            <div>
              <p className="eyebrow">후보 지역 결과</p>
              <h2>균형, 놀기, 귀가 좋은 곳을 겹치지 않게 보여 줍니다.</h2>
            </div>
            <button type="button" className="primary" onClick={calculate} disabled={!activeMeeting || loading}>
              <RefreshCw size={18} /> 재계산
            </button>
          </div>
          {activeMeeting?.relaxationMessage ? <div className="notice warn"><AlertTriangle size={18} /> {activeMeeting.relaxationMessage}</div> : null}
          {activeMeeting?.candidates.length ? (
            <div className="results-layout">
              <RouteMap meeting={activeMeeting} />
              <div className="candidate-grid">
                {activeMeeting.candidates.map((candidate) => (
                  <article className="candidate" key={candidate.id}>
                    <div className="section-header small">
                      <div>
                        <h3>{candidate.hub.displayName}</h3>
                        <p>{candidate.hub.region}</p>
                      </div>
                      <strong>{Math.round(candidate.score.finalScore)}점</strong>
                    </div>
                    <div className="badges">
                      {candidate.candidateTypes.map((type) => <StateBadge key={type} label={candidateTypeLabel(type)} tone="good" />)}
                    </div>
                    <ul className="metric-list compact">
                      {candidate.explanationFacts.map((fact) => <li key={fact.label}><span>{fact.label}</span><strong>{fact.value}</strong></li>)}
                    </ul>
                    <details>
                      <summary>사람별 부담과 데이터 출처</summary>
                      <div className="table-scroll">
                        <table>
                          <thead><tr><th>참여자</th><th>부담</th><th>이동</th><th>환승</th><th>도보</th><th>교통비</th></tr></thead>
                          <tbody>
                            {candidate.burdens.map((burden) => {
                              const route = candidate.routePairs.find((pair) => pair.participantId === burden.participantId)?.outbound;
                              return (
                                <tr key={burden.participantId}>
                                  <td>{burden.participantName}</td>
                                  <td>{burden.total === null ? "미확인" : Math.round(burden.total)}</td>
                                  <td>{route?.totalTravelMinutes.value ?? "unknown"}분</td>
                                  <td>{route?.transfers.value ?? "unknown"}</td>
                                  <td>{route?.walkMinutes.value ?? "unknown"}분</td>
                                  <td>{route?.fareWon.value ?? "unknown"}원</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="hint">Provider: fixture-transit · ODsay live routing is not used here · missing: {candidate.missing.slice(0, 4).join(", ")}</p>
                    </details>
                    <button type="button" onClick={() => lockRegion(candidate.id)}><MapPin size={18} /> 이 지역 확정</button>
                  </article>
                ))}
              </div>
            </div>
          ) : <div className="empty">계산된 후보가 없습니다. 입력 상태를 확인하고 후보 계산을 실행하세요.</div>}
        </section>
      ) : null}

      {activeTab === "vote" ? (
        <section className="screen two-col">
          <div className="panel">
            <p className="eyebrow">지역 투표</p>
            <h2>이번 후보에 한 표씩 남깁니다.</h2>
            {activeMeeting?.candidates.length ? (
              <>
                <div className="form-grid">
                  <label>참여자
                    <select value={voteParticipantId} onChange={(event) => setVoteParticipantId(event.target.value)}>
                      <option value="">선택</option>
                      {activeMeeting.participants.map((participant) => <option value={participant.id} key={participant.id}>{participant.displayName}</option>)}
                    </select>
                  </label>
                  <label>후보
                    <select value={voteCandidateId} onChange={(event) => setVoteCandidateId(event.target.value)}>
                      <option value="">선택</option>
                      {activeMeeting.candidates.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.hub.displayName}</option>)}
                    </select>
                  </label>
                </div>
                <button type="button" className="primary" onClick={voteForCandidate}><Vote size={18} /> 투표 저장</button>
                <div className="notice">
                  {voteResult?.reason} · 미투표 {voteResult?.missingParticipantIds.length ?? 0}명
                </div>
                <button type="button" onClick={() => lockRegion()} disabled={!activeMeeting.candidates.length}><Check size={18} /> 투표 결과로 지역 확정</button>
              </>
            ) : <div className="empty">투표할 후보가 없습니다.</div>}
          </div>
          <div className="panel">
            <p className="eyebrow">장소 추천</p>
            <h2>{lockedCandidate ? `${lockedCandidate.hub.displayName} 반경 ${lockedCandidate.hub.searchRadiusMeters}m` : "지역 확정 전"}</h2>
            {activeMeeting?.venues.length ? (
              <div className="list compact">
                {activeMeeting.venues.map((venue) => (
                  <article className="venue" key={venue.id}>
                    <div>
                      <strong>{venue.displayName}</strong>
                      <p>{venue.category} · {venue.distanceFromHubMeters.value ?? "unknown"}m · 영업 {venue.openingStatus.value ?? "미확인"}</p>
                    </div>
                    <button type="button" onClick={() => confirmVenue(venue.id)}>장소 확정</button>
                  </article>
                ))}
              </div>
            ) : <div className="empty">지역을 확정하면 실제 장소 후보가 표시됩니다. Fixture에서는 별점·영업시간을 임의 생성하지 않습니다.</div>}
            {activeMeeting?.state === "confirmed" ? (
              <button type="button" className="primary" onClick={completeMeeting}><Check size={18} /> 모임 완료 및 장부 반영</button>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === "ledger" ? (
        <section className="screen two-col">
          <div className="panel">
            <p className="eyebrow">공평성 기록</p>
            <h2>사람을 평가하지 않고 이동 부담 균형만 봅니다.</h2>
            {activeGroup ? <LedgerBars ledger={activeGroup.ledger} friends={state.friends} /> : <div className="empty">그룹이 없습니다.</div>}
          </div>
          <div className="panel">
            <h3>다음 턴 제안</h3>
            {activeGroup ? (
              <ul className="metric-list">
                {Object.entries(activeGroup.ledger).sort((a, b) => b[1] - a[1]).map(([friendId, value]) => (
                  <li key={friendId}><span>{state.friends.find((friend) => friend.id === friendId)?.localAlias ?? friendId}</span><strong>{value.toFixed(1)}</strong></li>
                ))}
              </ul>
            ) : null}
            <p className="hint">양수는 최근 평균보다 더 많이 이동한 부담을 뜻합니다. 다음 모임에서는 해당 참여자 쪽으로 보정하는 후보가 유리해집니다.</p>
          </div>
        </section>
      ) : null}

      {activeTab === "settings" ? (
        <section className="screen two-col">
          <div className="panel">
            <p className="eyebrow">내 설정과 개인정보</p>
            <h2>위치는 내가 정한 범위만 나갑니다.</h2>
            <label>표시 이름<input value={state.profileName} onChange={(event) => updateState((previous) => ({ ...previous, profileName: event.target.value }))} /></label>
            <ul className="policy-list">
              <li><Shield size={18} /> 그룹에 공유할 때 정확한 주소와 좌표는 빼 둡니다.</li>
              <li><Shield size={18} /> 초대 토큰은 예측하기 어렵게 만들고 서버에서는 해시 저장 구조를 사용합니다.</li>
              <li><Shield size={18} /> 비회원 데이터는 해당 모임에만 사용하며 삭제 정책을 문서화했습니다.</li>
              <li><Shield size={18} /> Fixture는 프로덕션 결과처럼 조용히 사용되지 않도록 화면에 표시됩니다.</li>
            </ul>
          </div>
          <div className="panel">
            <p className="eyebrow">Provider/API 상태</p>
            <h2>외부 키와 데이터 준비 상태</h2>
            <button type="button" className="primary" onClick={checkProviders}><Database size={18} /> 상태 확인</button>
            <p className="mono">{providerStatus}</p>
            <button type="button" onClick={() => window.localStorage.removeItem(STORAGE_KEY)}>로컬 데모 저장소 삭제</button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function locationKeyByLabel(label: string) {
  return (Object.entries(LOCATION_PRESETS).find(([, value]) => value.label === label)?.[0] ?? "seongnam") as keyof typeof LOCATION_PRESETS;
}

function candidateTypeLabel(type: string) {
  const labels: Record<string, string> = {
    balanced: "균형 1위",
    play: "놀기 1위",
    return_safe: "귀가 1위",
    fast: "빠른 이동"
  };
  return labels[type] ?? type;
}

function LedgerBars({ ledger, friends }: { ledger: Record<string, number>; friends: FriendRecord[] }) {
  const max = Math.max(1, ...Object.values(ledger).map((value) => Math.abs(value)));
  return (
    <div className="ledger-bars">
      {Object.entries(ledger).map(([friendId, value]) => {
        const friend = friends.find((item) => item.id === friendId);
        return (
          <div className="ledger-row" key={friendId}>
            <span>{friend ? displayFriendName(friend) : friendId}</span>
            <div className="bar-track"><div className={value >= 0 ? "bar positive" : "bar negative"} style={{ width: `${Math.max(6, Math.abs(value / max) * 100)}%` }} /></div>
            <strong>{value.toFixed(1)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function StatusPanel({ meeting, warnings }: { meeting: MeetingRecord | null; warnings: string[] }) {
  return (
    <div className="panel">
      <p className="eyebrow">지금 모임</p>
      <h2>{meeting ? meeting.title : "진행 중인 모임 없음"}</h2>
      <ul className="state-machine">
        {[
          ["draft", "초안"],
          ["collecting", "입력"],
          ["calculating", "계산"],
          ["voting", "투표"],
          ["region_locked", "지역 확정"],
          ["venue_voting", "장소 투표"],
          ["confirmed", "확정"],
          ["completed", "완료"]
        ].map(([state, label]) => (
          <li key={state} className={meeting?.state === state ? "current" : ""}>{label}</li>
        ))}
      </ul>
      <p>정확한 좌표는 숨기고, 권역과 허브만 공유합니다.</p>
      {warnings.length > 0 ? <div className="notice warn">{warnings.slice(-3).join(" · ")}</div> : null}
    </div>
  );
}

function RouteMap({ meeting }: { meeting: MeetingRecord }) {
  const candidate = meeting.candidates[0];
  const points = meeting.participants.map((participant, index) => ({
    id: participant.id,
    label: participant.coarseOriginLabel,
    x: 12 + index * 18,
    y: 76 - (index % 2) * 18
  }));
  return (
    <div className="map-panel" aria-label="지도 중심 후보 비교">
      <div className="map-grid" />
      {points.map((point) => (
        <div className="pin participant-pin" key={point.id} style={{ left: `${point.x}%`, top: `${point.y}%` }}>
          <MapPin size={16} /> {point.label}
        </div>
      ))}
      {candidate ? (
        <div className="pin hub-pin" style={{ left: "52%", top: "42%" }}>
          <MapPin size={18} /> {candidate.hub.displayName}
        </div>
      ) : null}
      <div className="map-caption">
        정확 좌표 대신 공유 가능한 권역과 허브만 표시합니다. 상세 경로 수치는 아래 표에서 사용할 수 있습니다.
      </div>
    </div>
  );
}
