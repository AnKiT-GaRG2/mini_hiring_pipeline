// Captured from the real backend (GET /api/search) against the seed data, so the
// frontend tests exercise the actual response shape rather than one invented here.
// Regenerate by re-running the queries if the API contract changes.
export const realSearchResponses = {
  "Who's in Interview right now?": {
    "success": true,
    "query": "Who's in Interview right now?",
    "parsedQuery": {
      "currentStage": "INTERVIEW"
    },
    "results": [
      {
        "id": "cmul49xel000hna8k4whbmm4r",
        "name": "Sneha Reddy",
        "email": "sneha.reddy@example.com",
        "phone": "+91-99887-66554",
        "currentStage": "INTERVIEW",
        "createdAt": "2026-09-03T10:40:51.549Z",
        "updatedAt": "2026-09-18T10:40:51.555Z",
        "currentStageSince": "2026-09-18T10:40:51.555Z",
        "daysInCurrentStage": 10,
        "score": null,
        "matchType": null
      },
      {
        "id": "cmul49xe9000bna8ke9szh0pd",
        "name": "Vikram Nair",
        "email": "vikram.nair@example.com",
        "phone": null,
        "currentStage": "INTERVIEW",
        "createdAt": "2026-09-08T10:40:51.536Z",
        "updatedAt": "2026-09-25T10:40:51.542Z",
        "currentStageSince": "2026-09-25T10:40:51.542Z",
        "daysInCurrentStage": 3,
        "score": null,
        "matchType": null
      }
    ]
  },
  "Who has been stuck in Screening for more than a week?": {
    "success": true,
    "query": "Who has been stuck in Screening for more than a week?",
    "parsedQuery": {
      "currentStage": "SCREENING",
      "currentStageDuration": {
        "operator": ">",
        "durationDays": 7
      }
    },
    "results": [
      {
        "id": "cmul49xdm0003na8kb9kfcswr",
        "name": "Rahul Mehta",
        "email": "rahul.mehta@example.com",
        "phone": null,
        "currentStage": "SCREENING",
        "createdAt": "2026-09-18T10:40:51.513Z",
        "updatedAt": "2026-09-20T10:40:51.516Z",
        "currentStageSince": "2026-09-20T10:40:51.516Z",
        "daysInCurrentStage": 8,
        "score": null,
        "matchType": null
      }
    ]
  },
  "Who moved to Interview since Monday?": {
    "success": true,
    "query": "Who moved to Interview since Monday?",
    "parsedQuery": {
      "movedToStage": {
        "stage": "INTERVIEW",
        "since": "2026-09-27T18:30:00.000Z"
      }
    },
    "message": "No candidates matched. I interpreted your search as: moved to Interview since 2026-09-28.",
    "results": []
  },
  "Who reached the Offer stage but didn't get hired?": {
    "success": true,
    "query": "Who reached the Offer stage but didn't get hired?",
    "parsedQuery": {
      "reachedStageNotHired": "OFFER"
    },
    "results": [
      {
        "id": "cmul49xey000nna8kg42y9h6a",
        "name": "Arjun Kapoor",
        "email": "arjun.kapoor@example.com",
        "phone": null,
        "currentStage": "OFFER",
        "createdAt": "2026-08-29T10:40:51.561Z",
        "updatedAt": "2026-09-24T10:40:51.570Z",
        "currentStageSince": "2026-09-24T10:40:51.570Z",
        "daysInCurrentStage": 4,
        "score": null,
        "matchType": null
      },
      {
        "id": "cmul49xfc000vna8kxx6hu1nk",
        "name": "Divya Menon",
        "email": "divya.menon@example.com",
        "phone": "+91-97654-32109",
        "currentStage": "OFFER",
        "createdAt": "2026-08-24T10:40:51.575Z",
        "updatedAt": "2026-09-27T10:40:51.584Z",
        "currentStageSince": "2026-09-27T10:40:51.584Z",
        "daysInCurrentStage": 1,
        "score": null,
        "matchType": null
      },
      {
        "id": "cmul49xgu001rna8k8i1x61h4",
        "name": "Ritu Singh",
        "email": "ritu.singh@example.com",
        "phone": "+91-95432-10987",
        "currentStage": "REJECTED",
        "createdAt": "2026-08-19T10:40:51.629Z",
        "updatedAt": "2026-09-20T10:40:51.640Z",
        "currentStageSince": "2026-09-20T10:40:51.640Z",
        "daysInCurrentStage": 8,
        "score": null,
        "matchType": null
      }
    ]
  },
  "Everyone except rejected candidates": {
    "success": true,
    "query": "Everyone except rejected candidates",
    "parsedQuery": {
      "excludeStages": [
        "REJECTED"
      ]
    },
    "results": [
      {
        "id": "cmul49xde0001na8kidbj58lf",
        "name": "Priya Sharma",
        "email": "priya.sharma@example.com",
        "phone": "+91-98765-43210",
        "currentStage": "APPLIED",
        "createdAt": "2026-09-26T10:40:51.502Z",
        "updatedAt": "2026-09-26T10:40:51.503Z",
        "currentStageSince": "2026-09-26T10:40:51.503Z",
        "daysInCurrentStage": 2,
        "score": null,
        "matchType": null
      },
      {
        "id": "cmul49xe00007na8k0wx6ja09",
        "name": "Ananya Iyer",
        "email": "ananya.iyer@example.com",
        "phone": "+91-98123-45678",
        "currentStage": "SCREENING",
        "createdAt": "2026-09-23T10:40:51.527Z",
        "updatedAt": "2026-09-26T10:40:51.529Z",
        "currentStageSince": "2026-09-26T10:40:51.529Z",
        "daysInCurrentStage": 2,
        "score": null,
        "matchType": null
      },
      {
        "id": "cmul49xdm0003na8kb9kfcswr",
        "name": "Rahul Mehta",
        "email": "rahul.mehta@example.com",
        "phone": null,
        "currentStage": "SCREENING",
        "createdAt": "2026-09-18T10:40:51.513Z",
        "updatedAt": "2026-09-20T10:40:51.516Z",
        "currentStageSince": "2026-09-20T10:40:51.516Z",
        "daysInCurrentStage": 8,
        "score": null,
        "matchType": null
      },
      {
        "id": "cmul49xel000hna8k4whbmm4r",
        "name": "Sneha Reddy",
        "email": "sneha.reddy@example.com",
        "phone": "+91-99887-66554",
        "currentStage": "INTERVIEW",
        "createdAt": "2026-09-03T10:40:51.549Z",
        "updatedAt": "2026-09-18T10:40:51.555Z",
        "currentStageSince": "2026-09-18T10:40:51.555Z",
        "daysInCurrentStage": 10,
        "score": null,
        "matchType": null
      },
      {
        "id": "cmul49xe9000bna8ke9szh0pd",
        "name": "Vikram Nair",
        "email": "vikram.nair@example.com",
        "phone": null,
        "currentStage": "INTERVIEW",
        "createdAt": "2026-09-08T10:40:51.536Z",
        "updatedAt": "2026-09-25T10:40:51.542Z",
        "currentStageSince": "2026-09-25T10:40:51.542Z",
        "daysInCurrentStage": 3,
        "score": null,
        "matchType": null
      },
      {
        "id": "cmul49xey000nna8kg42y9h6a",
        "name": "Arjun Kapoor",
        "email": "arjun.kapoor@example.com",
        "phone": null,
        "currentStage": "OFFER",
        "createdAt": "2026-08-29T10:40:51.561Z",
        "updatedAt": "2026-09-24T10:40:51.570Z",
        "currentStageSince": "2026-09-24T10:40:51.570Z",
        "daysInCurrentStage": 4,
        "score": null,
        "matchType": null
      },
      {
        "id": "cmul49xfc000vna8kxx6hu1nk",
        "name": "Divya Menon",
        "email": "divya.menon@example.com",
        "phone": "+91-97654-32109",
        "currentStage": "OFFER",
        "createdAt": "2026-08-24T10:40:51.575Z",
        "updatedAt": "2026-09-27T10:40:51.584Z",
        "currentStageSince": "2026-09-27T10:40:51.584Z",
        "daysInCurrentStage": 1,
        "score": null,
        "matchType": null
      },
      {
        "id": "cmul49xfp0013na8k7w0sv2ha",
        "name": "Karan Malhotra",
        "email": "karan.malhotra@example.com",
        "phone": null,
        "currentStage": "HIRED",
        "createdAt": "2026-08-14T10:40:51.589Z",
        "updatedAt": "2026-09-26T10:40:51.600Z",
        "currentStageSince": "2026-09-26T10:40:51.600Z",
        "daysInCurrentStage": 2,
        "score": null,
        "matchType": null
      },
      {
        "id": "cmul49xg7001dna8kzlvepn4d",
        "name": "Neha Joshi",
        "email": "neha.joshi@example.com",
        "phone": "+91-96543-21098",
        "currentStage": "HIRED",
        "createdAt": "2026-08-09T10:40:51.606Z",
        "updatedAt": "2026-09-18T10:40:51.617Z",
        "currentStageSince": "2026-09-18T10:40:51.617Z",
        "daysInCurrentStage": 10,
        "score": null,
        "matchType": null
      }
    ]
  },
  "sharam": {
    "success": true,
    "query": "sharam",
    "parsedQuery": {
      "name": {
        "query": "sharam"
      }
    },
    "results": [
      {
        "id": "cmul49xde0001na8kidbj58lf",
        "name": "Priya Sharma",
        "email": "priya.sharma@example.com",
        "phone": "+91-98765-43210",
        "currentStage": "APPLIED",
        "createdAt": "2026-09-26T10:40:51.502Z",
        "updatedAt": "2026-09-26T10:40:51.503Z",
        "currentStageSince": "2026-09-26T10:40:51.503Z",
        "daysInCurrentStage": 2,
        "score": 0.5714286,
        "matchType": "fuzzy"
      }
    ]
  },
  "Find Priya Sharma": {
    "success": true,
    "query": "Find Priya Sharma",
    "parsedQuery": {
      "name": {
        "query": "Priya Sharma"
      }
    },
    "results": [
      {
        "id": "cmul49xde0001na8kidbj58lf",
        "name": "Priya Sharma",
        "email": "priya.sharma@example.com",
        "phone": "+91-98765-43210",
        "currentStage": "APPLIED",
        "createdAt": "2026-09-26T10:40:51.502Z",
        "updatedAt": "2026-09-26T10:40:51.503Z",
        "currentStageSince": "2026-09-26T10:40:51.503Z",
        "daysInCurrentStage": 2,
        "score": 1,
        "matchType": "exact"
      }
    ]
  },
  "purple elephants": {
    "success": true,
    "query": "purple elephants",
    "parsedQuery": {
      "name": {
        "query": "purple elephants"
      }
    },
    "message": "No candidates matched. I interpreted your search as: name similar to \"purple elephants\".",
    "results": []
  },
  "who is the": {
    "success": false,
    "query": "who is the",
    "message": "I couldn't understand this search.",
    "supportedFilters": [
      "candidate name (exact, prefix, or fuzzy/typo match)",
      "current stage",
      "time spent in current stage",
      "stage movement (e.g. moved to Interview)",
      "transition date (e.g. since Monday)",
      "hiring outcome (e.g. reached Offer but not hired)",
      "excluding a stage (e.g. everyone except rejected)"
    ],
    "results": []
  },
  "moved to Bananas": {
    "success": false,
    "query": "moved to Bananas",
    "message": "I understood you're referring to a stage (\"Bananas\"), but that's not a valid stage. Valid stages are: Applied, Screening, Interview, Offer, Hired, Rejected.",
    "supportedFilters": [
      "candidate name (exact, prefix, or fuzzy/typo match)",
      "current stage",
      "time spent in current stage",
      "stage movement (e.g. moved to Interview)",
      "transition date (e.g. since Monday)",
      "hiring outcome (e.g. reached Offer but not hired)",
      "excluding a stage (e.g. everyone except rejected)"
    ],
    "results": []
  },
  "Priya in Screening for more than 7 days": {
    "success": true,
    "query": "Priya in Screening for more than 7 days",
    "parsedQuery": {
      "currentStage": "SCREENING",
      "currentStageDuration": {
        "operator": ">",
        "durationDays": 7
      },
      "name": {
        "query": "Priya"
      }
    },
    "message": "No candidates matched. I interpreted your search as: name similar to \"Priya\"; currently in Screening; in current stage more than 7 days.",
    "results": []
  }
} as const
