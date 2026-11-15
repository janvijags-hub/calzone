//
//  Calzone.swift
//  HelloVitals
//
//  Calzone: look at a plate, see its calories, vitamins and minerals.
//  The picture (from the Meta glasses or this iPhone's camera) goes to calzone.py on the Mac.
//  The AI on the Mac (MedGemma) only names the foods and guesses grams. You check them here.
//  Every number comes from the USDA food table on the Mac. Practice app, not medical advice.
//
//  It uses the same Mac address and pairing code as the Glasses tab.
//

import Combine
import PhotosUI
import SwiftUI
import UIKit

// MARK: - What the Mac sends back

struct CZMatch: Codable, Hashable, Identifiable {
    let id: Int
    let name: String
    let kcal100: Double?
}

struct CZItem: Codable, Identifiable {
    var uid = UUID()
    var label: String
    var grams: Double
    var id: Int?
    var matches: [CZMatch]

    enum CodingKeys: String, CodingKey { case label, grams, id, matches }
}

struct CZScan: Codable { let items: [CZItem]; let seconds: Double }

struct CZTarget: Codable {
    let target: Double?
    let kind: String?
    let pct: Int?
    let note: String?
}

struct CZNutrient: Codable, Identifiable {
    let key: String
    let label: String
    let unit: String
    let group: String
    let amount: Double
    let fda: CZTarget?
    let nasa: CZTarget?
    var id: String { key }
}

struct CZFood: Codable, Identifiable { let id: Int; let name: String; let grams: Double; let kcal: Int }
struct CZPlateLine: Codable { let label: String; let at: String; let kcal: Double }

struct CZPlate: Codable {
    let foods: [CZFood]
    let nutrients: [CZNutrient]
    let plates: [CZPlateLine]?
    let date: String?
}

struct CZError: Codable { let error: String }

// MARK: - Talking to the Mac

@MainActor
final class CalzoneModel: ObservableObject {
    @Published var items: [CZItem] = []
    @Published var plate: CZPlate?
    @Published var today: CZPlate?
    @Published var status = "Look at a plate, then scan."
    @Published var busy = false
    @Published var found: [CZMatch] = []

    private let session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 120   // the AI on the Mac can take a while
        return URLSession(configuration: c)
    }()

    private var base: URL? {
        let text = UserDefaults.standard.string(forKey: "relayAddress") ?? "http://192.168.1.107:8140"
        return URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private func request(_ path: String, body: Any? = nil, query: [URLQueryItem] = []) async throws -> Data {
        guard let base, var parts = URLComponents(url: base.appendingPathComponent("calzone/" + path), resolvingAgainstBaseURL: false)
        else { throw URLError(.badURL) }
        if !query.isEmpty { parts.queryItems = query }
        guard let url = parts.url else { throw URLError(.badURL) }
        var req = URLRequest(url: url)
        req.setValue(UserDefaults.standard.string(forKey: "relayCode") ?? "", forHTTPHeaderField: "X-Relay-Code")
        if let body {
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await session.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard code == 200 else {
            if code == 403 { throw CZProblem("Wrong pairing code (see the Glasses tab)") }
            if let e = try? JSONDecoder().decode(CZError.self, from: data) { throw CZProblem(e.error) }
            throw CZProblem("The Mac answered \(code)")
        }
        return data
    }

    var sex = "male"

    /// Scan what the glasses see right now (the Mac already has their newest picture).
    func scanGlasses() async { await scan(path: "scan-glasses", body: [:]) }

    /// Scan a photo taken with this iPhone.
    func scanPhoto(_ image: UIImage) async {
        guard let jpeg = image.shrunk(to: 1024).jpegData(compressionQuality: 0.85) else { return }
        await scan(path: "scan", body: ["image": jpeg.base64EncodedString()])
    }

    private func scan(path: String, body: [String: Any]) async {
        busy = true
        status = "Looking at the plate… (about 5–15 seconds)"
        defer { busy = false }
        do {
            let result = try JSONDecoder().decode(CZScan.self, from: try await request(path, body: body))
            items = result.items
            status = items.isEmpty
                ? "No food found. Try again closer, with good light."
                : "Found \(items.count) food\(items.count == 1 ? "" : "s") in \(Int(result.seconds)) s. Check the names and grams."
            await update()
        } catch {
            status = "Scan failed: \(error.localizedDescription)"
        }
    }

    func update() async {
        let list = items.compactMap { item -> [String: Any]? in
            guard let id = item.id, item.grams > 0 else { return nil }
            return ["id": id, "grams": item.grams]
        }
        guard !list.isEmpty else { plate = nil; return }
        do {
            plate = try JSONDecoder().decode(CZPlate.self, from: try await request("plate", body: ["items": list, "sex": sex]))
        } catch {
            status = "Could not add up the plate: \(error.localizedDescription)"
        }
    }

    func search(_ text: String) async {
        guard text.count >= 2 else { found = []; return }
        struct R: Codable { let matches: [CZMatch] }
        found = (try? JSONDecoder().decode(R.self, from: try await request("search", query: [.init(name: "q", value: text)])))?.matches ?? []
    }

    func add(_ match: CZMatch, label: String) async {
        items.append(CZItem(label: label, grams: 100, id: match.id, matches: [match]))
        found = []
        await update()
    }

    func logPlate(label: String) async {
        let list = items.compactMap { i -> [String: Any]? in
            guard let id = i.id, i.grams > 0 else { return nil }
            return ["id": id, "grams": i.grams]
        }
        do {
            _ = try await request("log", body: ["items": list, "label": label])
            status = "Added to today."
            await loadToday()
        } catch {
            status = "Could not log: \(error.localizedDescription)"
        }
    }

    func loadToday() async {
        today = try? JSONDecoder().decode(CZPlate.self, from: try await request("today", query: [.init(name: "sex", value: sex)]))
    }
}

struct CZProblem: LocalizedError {
    let text: String
    init(_ text: String) { self.text = text }
    var errorDescription: String? { text }
}

extension UIImage {
    /// A smaller copy whose longest side is at most `side` points: quicker to send and for the AI.
    func shrunk(to side: CGFloat) -> UIImage {
        let scale = min(1, side / max(size.width, size.height))
        guard scale < 1 else { return self }
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
    }
}

// MARK: - The screen

struct CalzoneView: View {
    @StateObject private var model = CalzoneModel()
    @AppStorage("relayAddress") private var address = "http://192.168.1.107:8140"
    @AppStorage("relayCode") private var code = ""
    @AppStorage("calzoneSex") private var sex = "male"
    @AppStorage("calzoneCompare") private var compare = "both"
    @State private var showCamera = false
    @State private var picked: [PhotosPickerItem] = []
    @State private var photo: UIImage?
    @State private var addText = ""
    @State private var meal = "Lunch"

    var body: some View {
        NavigationStack {
            List {
                scanSection
                if !model.items.isEmpty { foodsSection }
                addSection
                if let plate = model.plate { totalsSection(plate, title: "This plate") }
                todaySection
                aboutSection
            }
            .navigationTitle("Calzone")
            .sheet(isPresented: $showCamera) {
                CameraPicker { image in
                    photo = image
                    Task { await model.scanPhoto(image) }
                }
                .ignoresSafeArea()
            }
            .task { model.sex = sex; await model.loadToday() }
            .onChange(of: sex) { _, value in model.sex = value; Task { await model.update(); await model.loadToday() } }
        }
    }

    private var scanSection: some View {
        Section {
            Button { Task { await model.scanGlasses() } } label: {
                Label("Scan glasses view", systemImage: "eyeglasses").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(model.busy)
            HStack(spacing: 12) {
                Button { showCamera = true } label: {
                    Label("Take photo", systemImage: "camera").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                // Upload pictures already in Photos: pick one or several plates; each is scanned in turn.
                PhotosPicker(selection: $picked, maxSelectionCount: 5, matching: .images) {
                    Label("Upload photos", systemImage: "photo.on.rectangle").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            .disabled(model.busy)
            .onChange(of: picked) { _, items in
                guard !items.isEmpty else { return }
                Task {
                    await scanUploads(items)
                    picked = []
                }
            }
            if model.busy { ProgressView() }
            Text(model.status).font(.callout)
            if let photo {
                Image(uiImage: photo).resizable().scaledToFit().frame(maxHeight: 160).clipShape(RoundedRectangle(cornerRadius: 8))
            }
        } footer: {
            Text("Glasses: start the video in the Glasses tab first, then look at the plate.")
        }
    }

    /// Scan photos chosen from the library. With several, all their foods go on one list (one meal).
    private func scanUploads(_ items: [PhotosPickerItem]) async {
        var found: [CZItem] = []
        for (n, item) in items.enumerated() {
            guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
                model.status = "Could not open photo \(n + 1)."
                continue
            }
            photo = image
            if items.count > 1 { model.status = "Photo \(n + 1) of \(items.count)…" }
            await model.scanPhoto(image)
            found += model.items
        }
        if items.count > 1 {
            model.items = found
            model.status = "Found \(found.count) foods in \(items.count) photos. Check the names and grams."
            await model.update()
        }
    }

    private var foodsSection: some View {
        Section("Foods on the plate (check them)") {
            ForEach($model.items) { $item in
                VStack(alignment: .leading, spacing: 6) {
                    Text("AI saw: \(item.label)").font(.caption).foregroundStyle(.secondary)
                    Picker("USDA food", selection: $item.id) {
                        ForEach(item.matches) { m in Text(m.name).tag(Optional(m.id)) }
                    }
                    .pickerStyle(.menu)
                    .onChange(of: item.id) { _, _ in Task { await model.update() } }
                    Stepper(value: $item.grams, in: 5...2000, step: 10) {
                        Text("\(Int(item.grams)) g")
                    }
                    .onChange(of: item.grams) { _, _ in Task { await model.update() } }
                }
            }
            .onDelete { rows in model.items.remove(atOffsets: rows); Task { await model.update() } }
        }
    }

    private var addSection: some View {
        Section("Add a food by name") {
            TextField("e.g. banana, dal, toast", text: $addText)
                .textInputAutocapitalization(.never)
                .onChange(of: addText) { _, text in Task { await model.search(text) } }
            ForEach(model.found) { m in
                Button {
                    Task { await model.add(m, label: addText); addText = "" }
                } label: {
                    VStack(alignment: .leading) {
                        Text(m.name).font(.callout)
                        Text("\(Int(m.kcal100 ?? 0)) kcal per 100 g").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private func totalsSection(_ plate: CZPlate, title: String) -> some View {
        Section {
            HStack(alignment: .firstTextBaseline) {
                Text("\(Int((plate.nutrients.first?.amount ?? 0).rounded()))").font(.system(size: 44, weight: .thin))
                Text("kcal").foregroundStyle(.secondary)
                Spacer()
                Text(title).font(.caption).foregroundStyle(.secondary)
            }
            Picker("Compare with", selection: $compare) {
                Text("Earth + space").tag("both"); Text("Earth (FDA)").tag("fda"); Text("Space (NASA)").tag("nasa")
            }
            .pickerStyle(.segmented)
            Picker("NASA needs for a", selection: $sex) { Text("man").tag("male"); Text("woman").tag("female") }
            ForEach(plate.nutrients) { n in NutrientRow(n: n, compare: compare) }
            if title == "This plate" {
                HStack {
                    TextField("Meal", text: $meal).frame(width: 100)
                    Button("Add this plate to today") { Task { await model.logPlate(label: meal) } }
                        .buttonStyle(.borderedProminent)
                }
            }
        } header: {
            Text(title == "This plate" ? "Calories, vitamins and minerals" : title)
        } footer: {
            Text("Numbers: USDA FoodData Central (public domain). Targets: FDA Daily Values and NASA JSC-67378 (2020).")
        }
    }

    @ViewBuilder private var todaySection: some View {
        if let today = model.today, let plates = today.plates, !plates.isEmpty {
            Section("Today so far") {
                ForEach(Array(plates.enumerated()), id: \.offset) { _, p in
                    HStack { Text("\(p.label) \(p.at)"); Spacer(); Text("\(Int(p.kcal.rounded())) kcal").foregroundStyle(.secondary) }
                }
            }
            totalsSection(today, title: "Today (\(today.date ?? ""))")
        }
    }

    private var aboutSection: some View {
        Section {
            TextField("Mac address", text: $address)
                .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            SecureField("Pairing code", text: $code).keyboardType(.numberPad)
            Text("The AI (MedGemma, on the Mac) only names foods and guesses grams. Guesses from a photo can be off by a lot. Practice app, not medical advice.")
                .font(.caption).foregroundStyle(.secondary)
        } header: {
            Text("Mac (same as the Glasses tab)")
        }
    }
}

/// One nutrient: amount, then a bar for Earth needs and one for space needs.
struct NutrientRow: View {
    let n: CZNutrient
    let compare: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(n.label).font(.callout)
                Spacer()
                Text("\(amount) \(n.unit)").font(.callout.monospacedDigit())
            }
            if compare != "nasa", let t = n.fda, t.pct != nil { bar(t, name: "Earth") }
            if compare != "fda", let t = n.nasa, t.pct != nil { bar(t, name: "Space") }
            if compare != "fda", let note = n.nasa?.note, !note.isEmpty {
                Text(note).font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    private var amount: String {
        n.amount >= 100 ? "\(Int(n.amount.rounded()))" : n.amount >= 10 ? String(format: "%.1f", n.amount) : String(format: "%.2g", n.amount)
    }

    private func bar(_ t: CZTarget, name: String) -> some View {
        let pct = t.pct ?? 0
        let limit = t.kind == "max"
        let color: Color = limit ? (pct > 100 ? .red : pct > 40 ? .orange : .gray) : (pct >= 100 ? .green : .blue)
        return HStack(spacing: 6) {
            Text(name).font(.caption2).foregroundStyle(.secondary).frame(width: 38, alignment: .leading)
            ProgressView(value: min(Double(pct), 100), total: 100).tint(color)
            Text("\(pct)%\(limit ? " of limit" : "")").font(.caption2.monospacedDigit()).frame(width: 78, alignment: .trailing)
        }
    }
}

/// The iPhone camera (or the photo library on a device without one).
struct CameraPicker: UIViewControllerRepresentable {
    let onPick: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onPick(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}
