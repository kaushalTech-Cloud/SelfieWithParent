// Latest selfies — replace with real, consented submissions (or load from your backend).
// tab: "parent" | "grand" | "ai"
(function () {
  var first = ["Aarav", "Meera", "Kabir", "Ananya", "Rohan", "Sara", "Ishaan", "Diya", "Vihaan", "Kavya",
               "Arjun", "Myra", "Reyansh", "Anika", "Advik", "Tara", "Neel", "Zoya", "Dev", "Pari"];
  var who = { parent: ["& Mom", "& Dad", "& Parents"], grand: ["& Nani", "& Dadu", "& Grandparents"], ai: ["(AI) & Mom", "(AI) & Dad"] };
  var tabs = { parent: 34, grand: 18, ai: 15 };
  var list = [], id = 1;
  Object.keys(tabs).forEach(function (tab) {
    for (var i = 0; i < tabs[tab]; i++) {
      list.push({
        id: id++,
        tab: tab,
        name: first[(i * 7 + tab.length) % first.length] + " " + who[tab][i % who[tab].length],
        city: ["Jaipur", "Pune", "Kochi", "Indore", "Patna", "Surat", "Mysuru", "Shimla"][i % 8],
        photo: "img/selfie-" + ((i % 6) + 1) + ".svg"
      });
    }
  });
  // Video messages — set `video` to the uploaded file's URL (and `photo` to its thumbnail).
  // Samples have no video yet, so the player shows a placeholder note.
  var vNames = ["Ishaan's message to Mom", "Meera thanks her Dad", "Kabir with Nani", "Diya's birthday wish", "Arjun & Dadu", "Zoya's letter, read aloud", "Neel & his parents"];
  vNames.forEach(function (n, i) {
    list.push({ id: id++, tab: "video", name: n, city: ["Pune", "Jaipur", "Kochi", "Indore", "Patna", "Surat", "Shimla"][i], photo: "img/selfie-" + ((i % 6) + 1) + ".svg", video: "", duration: 18 + i * 6 });
  });

  // Family posts — a photo, and sometimes a video too (`video` present = has a video)
  var families = ["The Sharma family", "The Iyer family", "The Khan family", "The Das family", "The Patel family",
                  "The Fernandes family", "The Singh family", "The Reddy family", "The Bose family"];
  families.forEach(function (n, i) {
    var item = { id: id++, tab: "family", name: n, city: ["Delhi", "Chennai", "Lucknow", "Kolkata", "Ahmedabad", "Goa", "Amritsar", "Hyderabad", "Kolkata"][i], photo: "img/selfie-" + ((i % 6) + 1) + ".svg" };
    if (i % 3 === 0) { item.video = ""; item.duration = 25 + i * 3; }
    list.push(item);
  });

  window.SELFIES = list;
})();
