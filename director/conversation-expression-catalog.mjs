import {HER_SOCIAL_CATALOG} from './heroine-social-catalog.mjs';
// Derived from the exact approved runtime social-catalog; no new assets.
const MOTUS_EXPRESSION_CATALOG = [
  {
    "id": "gestures-standing__IDLE-088",
    "profile": "stand",
    "identity": "IDLE-088 | MCU_am_Stand_Idle_Greet_08_WaveComeHere"
  },
  {
    "id": "gestures-standing__IDLE-089",
    "profile": "stand",
    "identity": "IDLE-089 | MCU_am_Stand_Idle_Greet_09_WaveComeHere"
  },
  {
    "id": "gestures-standing__IDLE-090",
    "profile": "stand",
    "identity": "IDLE-090 | MCU_am_Stand_Idle_Greet_10_WaveComeHere"
  },
  {
    "id": "gestures-standing__IDLE-081",
    "profile": "stand",
    "identity": "IDLE-081 | MCU_am_Stand_Idle_Greet_01_Wave"
  },
  {
    "id": "gestures-standing__IDLE-083",
    "profile": "stand",
    "identity": "IDLE-083 | MCU_am_Stand_Idle_Greet_03_Wave"
  },
  {
    "id": "gestures-standing__IDLE-087",
    "profile": "stand",
    "identity": "IDLE-087 | MCU_am_Stand_Idle_Greet_07_Wave"
  },
  {
    "id": "gestures-standing__IDLE-082",
    "profile": "stand",
    "identity": "IDLE-082 | MCU_am_Stand_Idle_Greet_02_Nod"
  },
  {
    "id": "gestures-standing__IDLE-084",
    "profile": "stand",
    "identity": "IDLE-084 | MCU_am_Stand_Idle_Greet_04_Nod"
  },
  {
    "id": "gestures-standing__IDLE-085",
    "profile": "stand",
    "identity": "IDLE-085 | MCU_am_Stand_Idle_Greet_05_Point"
  },
  {
    "id": "gestures-standing__IDLE-086",
    "profile": "stand",
    "identity": "IDLE-086 | MCU_am_Stand_Idle_Greet_06_Point"
  },
  {
    "id": "gestures-standing__IDLE-058",
    "profile": "stand",
    "identity": "IDLE-058 | MCU_am_Stand_Crowd_FistShakeLArm_01"
  },
  {
    "id": "gestures-standing__IDLE-061",
    "profile": "stand",
    "identity": "IDLE-061 | MCU_am_Stand_Crowd_FistShakeRArm_01"
  },
  {
    "id": "gestures-standing__IDLE-064",
    "profile": "stand",
    "identity": "IDLE-064 | MCU_am_Stand_Crowd_FistShakes_01"
  },
  {
    "id": "emotions-quiet__IDLE-210",
    "profile": "stand",
    "identity": "IDLE-210 | MCU_am_Stand_Idle_Waiting_03_CheckWatch"
  },
  {
    "id": "emotions-quiet__IDLE-211",
    "profile": "stand",
    "identity": "IDLE-211 | MCU_am_Stand_Idle_Waiting_04_LookAround"
  },
  {
    "id": "emotions-quiet__IDLE-040",
    "profile": "stand",
    "identity": "IDLE-040 | MCU_am_Stand_Idle_BrushOff_08_Chest"
  },
  {
    "id": "emotions-quiet__IDLE-153",
    "profile": "stand",
    "identity": "IDLE-153 | MCU_am_Stand_Idle_LookAtNails_01"
  },
  {
    "id": "emotions-quiet__IDLE-156",
    "profile": "stand",
    "identity": "IDLE-156 | MCU_am_Stand_Idle_LookAtNails_04_Bite"
  },
  {
    "id": "emotions-quiet__IDLE-201",
    "profile": "stand",
    "identity": "IDLE-201 | MCU_am_Stand_Idle_Tired_01"
  },
  {
    "id": "emotions-quiet__IDLE-022",
    "profile": "stand",
    "identity": "IDLE-022 | MCU_am_Stand_Idle_Breathe_01_Heavy"
  },
  {
    "id": "emotions-quiet__IDLE-017",
    "profile": "stand",
    "identity": "IDLE-017 | MCU_am_Stand_BodyAche_02_Shoulders"
  },
  {
    "id": "emotions-quiet__IDLE-002",
    "profile": "stand",
    "identity": "IDLE-002 | MCU_am_ArmsCrossedB_Idle_02_LookAround"
  },
  {
    "id": "emotions-loud__IDLE-047",
    "profile": "stand",
    "identity": "IDLE-047 | MCU_am_Stand_Crowd_CheerArms_01"
  },
  {
    "id": "emotions-loud__IDLE-048",
    "profile": "stand",
    "identity": "IDLE-048 | MCU_am_Stand_Crowd_CheerLArm_01"
  },
  {
    "id": "emotions-loud__IDLE-058",
    "profile": "stand",
    "identity": "IDLE-058 | MCU_am_Stand_Crowd_FistShakeLArm_01"
  },
  {
    "id": "emotions-loud__IDLE-061",
    "profile": "stand",
    "identity": "IDLE-061 | MCU_am_Stand_Crowd_FistShakeRArm_01"
  },
  {
    "id": "emotions-loud__IDLE-064",
    "profile": "stand",
    "identity": "IDLE-064 | MCU_am_Stand_Crowd_FistShakes_01"
  },
  {
    "id": "emotions-loud__IDLE-070",
    "profile": "stand",
    "identity": "IDLE-070 | MCU_am_Stand_Crowd_Shout_01"
  },
  {
    "id": "emotions-loud__IDLE-071",
    "profile": "stand",
    "identity": "IDLE-071 | MCU_am_Stand_Crowd_Shout_02"
  },
  {
    "id": "mixamo-gap__mxg_sad_idle",
    "profile": "stand",
    "identity": "mxg_sad_idle | Sad Idle"
  },
  {
    "id": "mixamo-gap__mxg_disappointed",
    "profile": "stand",
    "identity": "mxg_disappointed | Disappointed"
  },
  {
    "id": "mixamo-gap__mxg_defeated",
    "profile": "stand",
    "identity": "mxg_defeated | Defeated"
  },
  {
    "id": "mixamo-gap__mxg_surprised",
    "profile": "stand",
    "identity": "mxg_surprised | Surprised"
  },
  {
    "id": "mixamo-gap__mxg_terrified",
    "profile": "stand",
    "identity": "mxg_terrified | Terrified"
  },
  {
    "id": "mixamo-gap__mxg_victory_idle",
    "profile": "stand",
    "identity": "mxg_victory_idle | Victory Idle"
  },
  {
    "id": "mixamo-gap__mxg_laughing",
    "profile": "stand",
    "identity": "mxg_laughing | Laughing"
  },
  {
    "id": "mixamo-gap__mxg_arguing",
    "profile": "stand",
    "identity": "mxg_arguing | Standing Arguing"
  },
  {
    "id": "mixamo-gap__mxg_angry_gesture",
    "profile": "stand",
    "identity": "mxg_angry_gesture | Angry Gesture"
  },
  {
    "id": "mixamo-gap__mxg_annoyed_shake",
    "profile": "stand",
    "identity": "mxg_annoyed_shake | Annoyed Head Shake"
  },
  {
    "id": "mixamo-gap__mxg_bored",
    "profile": "stand",
    "identity": "mxg_bored | Bored"
  },
  {
    "id": "mixamo-gap__mxg_thoughtful_nod",
    "profile": "stand",
    "identity": "mxg_thoughtful_nod | Thoughtful Head Nod"
  },
  {
    "id": "mixamo-gap__mxg_thoughtful_shake",
    "profile": "stand",
    "identity": "mxg_thoughtful_shake | Thoughtful Head Shake"
  },
  {
    "id": "mixamo-gap__mxg_thinking",
    "profile": "stand",
    "identity": "mxg_thinking | Thinking"
  },
  {
    "id": "mixamo-gap__mxg_shrugging",
    "profile": "stand",
    "identity": "mxg_shrugging | Shrugging"
  },
  {
    "id": "mixamo-gap__mxg_look_away",
    "profile": "stand",
    "identity": "mxg_look_away | Look Away Gesture"
  },
  {
    "id": "mixamo-gap__mxg_whatever",
    "profile": "stand",
    "identity": "mxg_whatever | Whatever Gesture"
  },
  {
    "id": "arms_crossed",
    "profile": "stand",
    "identity": "IDLE-014 | MCU_am_Stand_Idle_Trans_ArmsCrossed|IDLE-006 | MCU_am_ArmsCrossed_Idle_01|IDLE-013 | MCU_am_ArmsCrossed_Trans_Stand_Idle"
  },
  {
    "id": "hands_hips",
    "profile": "stand",
    "identity": "IDLE-109 | MCU_am_Stand_Trans_HandsHip|IDLE-102 | MCU_am_HandsHip_Idle_01|IDLE-106 | MCU_am_HandsHip_Trans_Stand"
  },
  {
    "id": "clap_a",
    "profile": "stand",
    "identity": "IDLE-053 | MCU_am_Stand_Crowd_ClapA_Start|IDLE-052 | MCU_am_Stand_Crowd_ClapA_01|IDLE-054 | MCU_am_Stand_Crowd_ClapA_Stop"
  },
  {
    "id": "clap_b",
    "profile": "stand",
    "identity": "IDLE-056 | MCU_am_Stand_Crowd_ClapB_Start|IDLE-055 | MCU_am_Stand_Crowd_ClapB_01|IDLE-057 | MCU_am_Stand_Crowd_ClapB_Stop"
  },
  {
    "id": "desk-front__SEAT-146",
    "profile": "desk-front",
    "identity": "SEAT-146 | MCU_am_SitChairTable_Idle_04_Talk"
  },
  {
    "id": "desk-front__SEAT-147",
    "profile": "desk-front",
    "identity": "SEAT-147 | MCU_am_SitChairTable_Idle_05_Talk"
  },
  {
    "id": "bench-front__SEAT-018",
    "profile": "bench-front",
    "identity": "SEAT-022 | MCU_am_SitChair_Idle_TalkFwd_Start|SEAT-018 | MCU_am_SitChair_Idle_TalkFwd_01|SEAT-023 | MCU_am_SitChair_Idle_TalkFwd_Stop"
  },
  {
    "id": "bench-front__SEAT-020",
    "profile": "bench-front",
    "identity": "SEAT-022 | MCU_am_SitChair_Idle_TalkFwd_Start|SEAT-020 | MCU_am_SitChair_Idle_TalkFwd_03_HandGestures|SEAT-023 | MCU_am_SitChair_Idle_TalkFwd_Stop"
  },
  {
    "id": "bench-front__SEAT-021",
    "profile": "bench-front",
    "identity": "SEAT-022 | MCU_am_SitChair_Idle_TalkFwd_Start|SEAT-021 | MCU_am_SitChair_Idle_TalkFwd_04_HandGestures|SEAT-023 | MCU_am_SitChair_Idle_TalkFwd_Stop"
  },
  {
    "id": "bench-left__SEAT-024",
    "profile": "bench-left",
    "identity": "SEAT-027 | MCU_am_SitChair_Idle_TalkLeft_Start|SEAT-024 | MCU_am_SitChair_Idle_TalkLeft_01|SEAT-028 | MCU_am_SitChair_Idle_TalkLeft_Stop"
  },
  {
    "id": "bench-left__SEAT-025",
    "profile": "bench-left",
    "identity": "SEAT-027 | MCU_am_SitChair_Idle_TalkLeft_Start|SEAT-025 | MCU_am_SitChair_Idle_TalkLeft_02|SEAT-028 | MCU_am_SitChair_Idle_TalkLeft_Stop"
  },
  {
    "id": "bench-right__SEAT-029",
    "profile": "bench-right",
    "identity": "SEAT-032 | MCU_am_SitChair_Idle_TalkRight_Start|SEAT-029 | MCU_am_SitChair_Idle_TalkRight_01|SEAT-033 | MCU_am_SitChair_Idle_TalkRight_Stop"
  },
  {
    "id": "bench-right__SEAT-030",
    "profile": "bench-right",
    "identity": "SEAT-032 | MCU_am_SitChair_Idle_TalkRight_Start|SEAT-030 | MCU_am_SitChair_Idle_TalkRight_02|SEAT-033 | MCU_am_SitChair_Idle_TalkRight_Stop"
  }
];

export const EXPRESSION_CATALOG=[...MOTUS_EXPRESSION_CATALOG.map(s=>({...s,actorKind:'motus'})),...HER_SOCIAL_CATALOG.styles.filter(s=>s.entries.every(id=>HER_SOCIAL_CATALOG.entries.some(e=>e.id===id&&e.available))).map(s=>({...s,actorKind:'heroine-her',identity:s.entries.map(id=>HER_SOCIAL_CATALOG.entries.find(e=>e.id===id).sourceIdentity).join('|')}))];
