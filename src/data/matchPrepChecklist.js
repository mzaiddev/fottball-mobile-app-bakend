const MATCH_PREP_SECTIONS = [
  {
    id: "equipment",
    items: [
      { id: "boots", title: "Check boots", subtitle: "Ensure boots are clean and in good condition" },
      { id: "kit", title: "Pack match kit", subtitle: "Jersey, shorts, socks, shin guards" },
      { id: "bottle", title: "Pack water bottle", subtitle: "Bring filled water bottle" },
      { id: "gymbag", title: "Check gym bag", subtitle: "Verify all training gear is packed" },
      { id: "tracker", title: "Charge fitness tracker", subtitle: "Ensure wearable device is charged" }
    ]
  },
  {
    id: "nutrition",
    items: [
      { id: "premeal", title: "Pre-match meal", subtitle: "Eat light meal 2-3 hours before match" },
      { id: "hydration", title: "Hydration check", subtitle: "Drink adequate water throughout day" },
      { id: "snack", title: "Pack snack", subtitle: "Bring banana or energy bar for pre-match" },
      { id: "newfoods", title: "Avoid new foods", subtitle: "Stick to familiar foods before match" }
    ]
  },
  {
    id: "mental",
    items: [
      { id: "plan", title: "Review match plan", subtitle: "Go over tactical instructions" },
      { id: "viz", title: "Visualize performance", subtitle: "Mental rehearsal of key moments" },
      { id: "goals", title: "Set personal goals", subtitle: "Focus on 1-2 personal objectives" },
      { id: "mindset", title: "Positive mindset", subtitle: "Stay confident and focused" }
    ]
  },
  {
    id: "physical",
    items: [
      { id: "warmup", title: "Warm-up routine", subtitle: "Complete pre-match dynamic stretching" },
      { id: "injury", title: "Check injury status", subtitle: "Report any pain or discomfort" },
      { id: "rest", title: "Adequate rest", subtitle: "Get proper sleep night before" }
    ]
  },
  {
    id: "tactical",
    items: [
      { id: "opponent", title: "Know opponent", subtitle: "Review opponent strengths and weaknesses" },
      { id: "position", title: "Confirm position", subtitle: "Know your role in formation" },
      { id: "comms", title: "Team communication", subtitle: "Discuss key plays with teammates" }
    ]
  }
];

function createDefaultPreparationChecklist() {
  return MATCH_PREP_SECTIONS.flatMap((section) =>
    section.items.map((item) => ({
      id: item.id,
      sectionId: section.id,
      title: item.title,
      label: item.title,
      subtitle: item.subtitle,
      completed: false,
      completedAt: null
    }))
  );
}

module.exports = { MATCH_PREP_SECTIONS, createDefaultPreparationChecklist };
