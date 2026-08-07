/**
 * Psalm of the day.
 *
 * Text: World English Bible (WEB), public domain -- no licence restrictions.
 * Retrieved from bible-api.com and stored here so the site never depends on a
 * third-party API at page load.
 *
 * Rotation uses the day of the year in Philippine time (UTC+8), so the verse
 * changes at local midnight and the same calendar date does not repeat the
 * same verse month after month.
 */
window.PSALM_OF_THE_DAY = (function () {
  const VERSES = [
  { ref: "Psalm 23:1", text: "Yahweh is my shepherd: I shall lack nothing." },
  { ref: "Psalm 23:2", text: "He makes me lie down in green pastures. He leads me beside still waters." },
  { ref: "Psalm 23:3", text: "He restores my soul. He guides me in the paths of righteousness for his name's sake." },
  { ref: "Psalm 23:4", text: "Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me." },
  { ref: "Psalm 23:6", text: "Surely goodness and loving kindness shall follow me all the days of my life." },
  { ref: "Psalm 34:1", text: "I will bless Yahweh at all times. His praise will always be in my mouth." },
  { ref: "Psalm 34:2", text: "My soul shall boast in Yahweh. The humble shall hear of it, and be glad." },
  { ref: "Psalm 34:3", text: "Oh magnify Yahweh with me. Let us exalt his name together." },
  { ref: "Psalm 34:4", text: "I sought Yahweh, and he answered me, and delivered me from all my fears." },
  { ref: "Psalm 34:5", text: "They looked to him, and were radiant. Their faces shall never be covered with shame." },
  { ref: "Psalm 34:7", text: "Yahweh's angel encamps around those who fear him, and delivers them." },
  { ref: "Psalm 34:8", text: "Oh taste and see that Yahweh is good. Blessed is the man who takes refuge in him." },
  { ref: "Psalm 91:1", text: "He who dwells in the secret place of the Most High will rest in the shadow of the Almighty." },
  { ref: "Psalm 91:2", text: "I will say of Yahweh, \u201cHe is my refuge and my fortress; my God, in whom I trust.\u201d" },
  { ref: "Psalm 91:4", text: "He will cover you with his feathers. Under his wings you will take refuge." },
  { ref: "Psalm 91:5", text: "You shall not be afraid of the terror by night, nor of the arrow that flies by day." },
  { ref: "Psalm 103:1", text: "Praise Yahweh, my soul! All that is within me, praise his holy name!" },
  { ref: "Psalm 103:2", text: "Praise Yahweh, my soul, and don't forget all his benefits." },
  { ref: "Psalm 103:3", text: "Who forgives all your sins; who heals all your diseases." },
  { ref: "Psalm 103:4", text: "Who redeems your life from destruction; who crowns you with loving kindness and tender mercies." },
  { ref: "Psalm 103:5", text: "Who satisfies your desire with good things, so that your youth is renewed like the eagle's." },
  { ref: "Psalm 121:1", text: "I will lift up my eyes to the hills. Where does my help come from?" },
  { ref: "Psalm 121:2", text: "My help comes from Yahweh, who made heaven and earth." },
  { ref: "Psalm 121:3", text: "He will not allow your foot to be moved. He who keeps you will not slumber." },
  { ref: "Psalm 121:5", text: "Yahweh is your keeper. Yahweh is your shade on your right hand." },
  { ref: "Psalm 121:6", text: "The sun will not harm you by day, nor the moon by night." },
  { ref: "Psalm 121:7", text: "Yahweh will keep you from all evil. He will keep your soul." },
  { ref: "Psalm 121:8", text: "Yahweh will keep your going out and your coming in, from this time forward, and forever more." },
  { ref: "Psalm 145:8", text: "Yahweh is gracious, merciful, slow to anger, and of great loving kindness." },
  { ref: "Psalm 145:9", text: "Yahweh is good to all. His tender mercies are over all his works." },
  { ref: "Psalm 145:13", text: "Your kingdom is an everlasting kingdom. Yahweh is faithful in all his words, and loving in all his deeds." }
  ];

  // Day of year in Asia/Manila, independent of the visitor's own timezone.
  const nowPH = new Date(Date.now() + (8 * 60 + new Date().getTimezoneOffset()) * 60000);
  const startOfYear = new Date(nowPH.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((nowPH - startOfYear) / 86400000);

  return VERSES[dayOfYear % VERSES.length];
})();
