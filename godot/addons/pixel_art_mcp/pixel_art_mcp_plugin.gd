@tool
extends EditorPlugin

# ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_BRIDGE_URL := "http://127.0.0.1:8787"
const DEFAULT_DEST_FOLDER := "res://assets/pixel_art"

# ─── UI nodes ─────────────────────────────────────────────────────────────────
var _dock: ScrollContainer
var _bridge_url: LineEdit
var _token: LineEdit
var _assets_list: OptionButton
var _dest_folder: LineEdit
var _preview_rect: TextureRect
var _status_label: Label
var _import_btn: Button
var _reimport_btn: Button

# ─── State ────────────────────────────────────────────────────────────────────
var _http: HTTPRequest
var _request_kind := ""
var _asset_ids: Array[String] = []
var _asset_names: Array[String] = []
var _selected_id := ""
var _last_metadata: Dictionary = {}
var _is_reimport := false
# png_res_path -> { slug, base, sf_path, png_bytes, metadata }
var _pending_spriteframes: Dictionary = {}


# ─── Lifecycle ────────────────────────────────────────────────────────────────

func _enter_tree() -> void:
	_dock = ScrollContainer.new()
	_dock.name = "Pixel Art MCP"
	_dock.custom_minimum_size = Vector2(270, 0)
	_dock.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED

	var vbox := VBoxContainer.new()
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_dock.add_child(vbox)

	# ── Bridge connection ──────────────────────────────────────────────────────
	_add_heading(vbox, "Pixel Art MCP")

	_add_hint(vbox, "Bridge URL")
	_bridge_url = LineEdit.new()
	_bridge_url.text = DEFAULT_BRIDGE_URL
	vbox.add_child(_bridge_url)

	_add_hint(vbox, "Token (opcional)")
	_token = LineEdit.new()
	_token.placeholder_text = "Token de autenticação"
	_token.secret = true
	vbox.add_child(_token)

	vbox.add_child(HSeparator.new())

	# ── Asset list ─────────────────────────────────────────────────────────────
	_add_heading(vbox, "Assets")

	var list_btn := Button.new()
	list_btn.text = "Listar assets da bridge"
	list_btn.pressed.connect(_request_assets)
	vbox.add_child(list_btn)

	_assets_list = OptionButton.new()
	_assets_list.clip_text = true
	_assets_list.item_selected.connect(_on_asset_selected)
	vbox.add_child(_assets_list)

	vbox.add_child(HSeparator.new())

	# ── Destination folder ─────────────────────────────────────────────────────
	_add_heading(vbox, "Destino")
	_add_hint(vbox, "Pasta base no projeto Godot")
	_dest_folder = LineEdit.new()
	_dest_folder.text = DEFAULT_DEST_FOLDER
	vbox.add_child(_dest_folder)
	_add_hint(vbox, "Estrutura: <pasta>/<slug>/<slug>.png")

	vbox.add_child(HSeparator.new())

	# ── Preview ────────────────────────────────────────────────────────────────
	_add_heading(vbox, "Preview")

	var preview_btn := Button.new()
	preview_btn.text = "Exibir spritesheet do asset"
	preview_btn.pressed.connect(_request_preview)
	vbox.add_child(preview_btn)

	_preview_rect = TextureRect.new()
	_preview_rect.custom_minimum_size = Vector2(256, 64)
	_preview_rect.expand_mode = TextureRect.EXPAND_FIT_WIDTH_PROPORTIONAL
	_preview_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	vbox.add_child(_preview_rect)

	vbox.add_child(HSeparator.new())

	# ── Import ─────────────────────────────────────────────────────────────────
	_add_heading(vbox, "Importação")

	_import_btn = Button.new()
	_import_btn.text = "Importar asset"
	_import_btn.tooltip_text = (
		"Baixa PNG, metadata e cria SpriteFrames pixel-perfect"
	)
	_import_btn.pressed.connect(_start_import.bind(false))
	vbox.add_child(_import_btn)

	_reimport_btn = Button.new()
	_reimport_btn.text = "Reimportar (sobrescrever)"
	_reimport_btn.tooltip_text = (
		"Força atualização mesmo que os arquivos já existam"
	)
	_reimport_btn.pressed.connect(_start_import.bind(true))
	vbox.add_child(_reimport_btn)

	vbox.add_child(HSeparator.new())

	# ── Status ─────────────────────────────────────────────────────────────────
	_status_label = Label.new()
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status_label.text = (
		"Bridge esperada em 127.0.0.1:8787.\n"
		+"Clique em 'Listar assets' para começar."
	)
	vbox.add_child(_status_label)

	# ── HTTP ───────────────────────────────────────────────────────────────────
	_http = HTTPRequest.new()
	_dock.add_child(_http)
	_http.request_completed.connect(_on_request_completed)

	# Connect to reimport signal so SpriteFrames are created after the texture
	# is properly imported with pixel-perfect settings.
	EditorInterface.get_resource_filesystem().files_reimported.connect(
		_on_files_reimported
	)

	add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)


func _exit_tree() -> void:
	var fs := EditorInterface.get_resource_filesystem()
	if fs.files_reimported.is_connected(_on_files_reimported):
		fs.files_reimported.disconnect(_on_files_reimported)
	_pending_spriteframes.clear()
	if _dock:
		remove_control_from_docks(_dock)
		_dock.free()


# ─── UI helpers ───────────────────────────────────────────────────────────────

func _add_heading(parent: VBoxContainer, text: String) -> void:
	var lbl := Label.new()
	lbl.text = text
	lbl.add_theme_font_size_override("font_size", 14)
	parent.add_child(lbl)


func _add_hint(parent: VBoxContainer, text: String) -> void:
	var lbl := Label.new()
	lbl.text = text
	lbl.add_theme_color_override("font_color", Color(0.65, 0.65, 0.65))
	parent.add_child(lbl)


func _set_status(msg: String) -> void:
	_status_label.text = msg
	print("[PixelArtMCP] %s" % msg)


func _set_busy(busy: bool) -> void:
	_import_btn.disabled = busy
	_reimport_btn.disabled = busy


# ─── URL / header helpers ─────────────────────────────────────────────────────

func _ep(path: String) -> String:
	return _bridge_url.text.strip_edges().trim_suffix("/") + path


func _headers(extra: Array = []) -> PackedStringArray:
	var h := PackedStringArray()
	for e in extra:
		h.append(String(e))
	var tok := _token.text.strip_edges()
	if tok != "":
		h.append("x-pixel-token: %s" % tok)
	return h


# ─── HTTP requests ────────────────────────────────────────────────────────────

func _request_assets() -> void:
	_request_kind = "assets"
	_set_status("Conectando à bridge...")
	var err := _http.request(_ep("/api/assets"), _headers())
	if err != OK:
		_set_status("Erro ao iniciar requisição (código %d)." % err)


func _request_preview() -> void:
	if _selected_id.is_empty():
		_set_status("Selecione um asset primeiro.")
		return
	_request_kind = "preview"
	_set_status("Baixando spritesheet para preview...")
	_http.request(
		_ep("/api/godot/asset/%s/spritesheet.png" % _selected_id),
		_headers()
	)


func _start_import(reimport: bool) -> void:
	if _selected_id.is_empty():
		_set_status("Selecione um asset primeiro.")
		return
	_is_reimport = reimport
	_request_kind = "import_metadata"
	_set_busy(true)
	_set_status("Buscando metadata do asset...")
	_http.request(
		_ep("/api/godot/asset/%s/metadata" % _selected_id),
		_headers()
	)


func _on_asset_selected(index: int) -> void:
	if index < 0 or index >= _asset_ids.size():
		return
	_selected_id = _asset_ids[index]
	_set_status(
		"Asset selecionado: %s\nClique em 'Importar asset' para importar."
		% _asset_names[index]
	)


# ─── Request completed ────────────────────────────────────────────────────────

func _on_request_completed(
	result: int,
	code: int,
	_hdr: PackedStringArray,
	body: PackedByteArray
) -> void:
	_set_busy(false)

	# Network-level errors → clear, actionable messages (no stack trace)
	match result:
		HTTPRequest.RESULT_CANT_CONNECT:
			_set_status(
				"Bridge offline.\nInicie o servidor e tente novamente.\n%s"
				% _bridge_url.text
			)
			return
		HTTPRequest.RESULT_CANT_RESOLVE:
			_set_status(
				"Endereço não resolvido.\nVerifique a URL da bridge:\n%s"
				% _bridge_url.text
			)
			return
		HTTPRequest.RESULT_CONNECTION_ERROR:
			_set_status(
				"Erro de conexão.\nVerifique se a bridge está em execução."
			)
			return
		HTTPRequest.RESULT_NO_RESPONSE:
			_set_status(
				"Servidor não respondeu.\nA bridge pode estar sobrecarregada."
			)
			return
		HTTPRequest.RESULT_TIMEOUT:
			_set_status("Timeout. A bridge demorou para responder.")
			return

	if result != HTTPRequest.RESULT_SUCCESS:
		_set_status("Erro de rede: código %d." % result)
		return

	# HTTP-level errors
	if code == 401:
		_set_status("Não autorizado (401).\nVerifique o token configurado.")
		return
	if code == 404:
		_set_status(
			"Recurso não encontrado (404).\n"
			+"O asset pode não existir mais na bridge."
		)
		return
	if code < 200 or code >= 300:
		_set_status("Erro HTTP %d." % code)
		return

	match _request_kind:
		"assets":
			var parsed = JSON.parse_string(body.get_string_from_utf8())
			if typeof(parsed) == TYPE_ARRAY:
				_apply_assets(parsed)
			else:
				_set_status("Resposta inválida ao listar assets.")

		"preview":
			var img := Image.new()
			if img.load_png_from_buffer(body) == OK:
				_preview_rect.texture = ImageTexture.create_from_image(img)
				_set_status("Preview atualizado.")
			else:
				_set_status("PNG de preview inválido.")

		"import_metadata":
			var parsed = JSON.parse_string(body.get_string_from_utf8())
			if typeof(parsed) != TYPE_DICTIONARY or not parsed.has("animations"):
				_set_status(
					"Metadata inválida ou asset sem animações.\n"
					+"Verifique se o asset está configurado corretamente na bridge."
				)
				return
			_last_metadata = parsed
			_request_kind = "import_spritesheet"
			_set_busy(true)
			_set_status("Metadata recebida. Baixando spritesheet...")
			_http.request(
				_ep("/api/godot/asset/%s/spritesheet.png" % _selected_id),
				_headers()
			)

		"import_spritesheet":
			_finish_import(body)

		_:
			_set_status("Resposta recebida.")


# ─── Asset list ───────────────────────────────────────────────────────────────

func _apply_assets(assets: Array) -> void:
	_assets_list.clear()
	_asset_ids.clear()
	_asset_names.clear()
	for asset in assets:
		if typeof(asset) != TYPE_DICTIONARY:
			continue
		var name := String(asset.get("name", "asset"))
		var id := String(asset.get("id", name))
		var anim_count: int = (asset.get("animations", []) as Array).size()
		_asset_ids.append(id)
		_asset_names.append(name)
		_assets_list.add_item("%s  (%d anim.)" % [name, anim_count])

	if _asset_ids.is_empty():
		_set_status("Nenhum asset encontrado na bridge.")
		return

	_set_status(
		"Bridge conectada. %d asset(s) disponível(is)." % _asset_ids.size()
	)
	_assets_list.select(0)
	_on_asset_selected(0)


# ─── Import pipeline ──────────────────────────────────────────────────────────

func _dest_base() -> String:
	return _dest_folder.text.strip_edges().trim_suffix("/")


func _global(res_path: String) -> String:
	return ProjectSettings.globalize_path(res_path)


func _finish_import(png_bytes: PackedByteArray) -> void:
	if _last_metadata.is_empty():
		_set_status("Metadata ausente. Reinicie a importação.")
		return

	var asset_slug := String(_last_metadata.get("asset", "pixel_asset"))
	var base := "%s/%s" % [_dest_base(), asset_slug]
	var abs_base := _global(base)

	var dir_err := DirAccess.make_dir_recursive_absolute(abs_base)
	if dir_err != OK:
		_set_status("Falha ao criar pasta:\n%s\nCódigo: %d" % [base, dir_err])
		return

	var png_path := "%s/%s.png" % [base, asset_slug]
	var json_path := "%s/%s.json" % [base, asset_slug]
	var col_path := "%s/%s_collision.json" % [base, asset_slug]
	var sf_path := "%s/%s_spriteframes.tres" % [base, asset_slug]

	# Guard: don't overwrite unless explicitly reimporting
	if not _is_reimport:
		if FileAccess.file_exists(png_path) or FileAccess.file_exists(sf_path):
			_set_status(
				"Asset já importado em:\n%s\n"
				+"Use 'Reimportar (sobrescrever)' para atualizar." % base
			)
			return

	# 1. Write spritesheet PNG
	var png_file := FileAccess.open(png_path, FileAccess.WRITE)
	if png_file == null:
		_set_status(
			"Falha ao escrever PNG (erro %d):\n%s"
			% [FileAccess.get_open_error(), png_path]
		)
		return
	png_file.store_buffer(png_bytes)
	png_file.close()

	# 2. Write pixel-perfect Godot import settings BEFORE calling reimport_files
	_write_import_settings(png_path)

	# 3. Write animations metadata JSON
	var json_file := FileAccess.open(json_path, FileAccess.WRITE)
	if json_file:
		json_file.store_string(JSON.stringify(_last_metadata, "\t"))
		json_file.close()

	# 4. Write collision data (hitboxes / hurtboxes / attackboxes) if present
	var collision: Array = _last_metadata.get("collision", [])
	if not collision.is_empty():
		var col_file := FileAccess.open(col_path, FileAccess.WRITE)
		if col_file:
			col_file.store_string(JSON.stringify(collision, "\t"))
			col_file.close()

	# 5. Queue SpriteFrames creation: triggered by files_reimported signal
	_pending_spriteframes[png_path] = {
		"slug": asset_slug,
		"base": base,
		"sf_path": sf_path,
		"png_bytes": png_bytes,
		"metadata": _last_metadata.duplicate(true),
	}
	EditorInterface.get_resource_filesystem().reimport_files(
		PackedStringArray([png_path])
	)
	_set_status(
		"PNG salvo. Aplicando configurações pixel-perfect e criando SpriteFrames..."
	)


func _write_import_settings(png_res_path: String) -> void:
	# Write Godot 4 import settings for pixel-perfect textures.
	# reimport_files() reads these params and applies them during import,
	# producing a CompressedTexture2D with nearest-filter / no mipmaps.
	var cfg := ConfigFile.new()
	cfg.set_value("remap", "importer", "texture")
	cfg.set_value("remap", "type", "CompressedTexture2D")
	# Lossless (PNG) — no quality loss for pixel art
	cfg.set_value("params", "compress/mode", 0)
	cfg.set_value("params", "compress/high_quality", false)
	cfg.set_value("params", "compress/lossy_quality", 0.7)
	# No mipmaps — pixel art must not be blurred at distance
	cfg.set_value("params", "mipmaps/generate", false)
	cfg.set_value("params", "mipmaps/limit", -1)
	# No alpha bleed, no premultiplied alpha
	cfg.set_value("params", "process/fix_alpha_border", false)
	cfg.set_value("params", "process/premult_alpha", false)
	cfg.set_value("params", "process/size_limit", 0)
	# Do not treat as 3D texture
	cfg.set_value("params", "detect_3d/compress_to", 0)
	cfg.set_value("params", "svg/scale", 1.0)
	cfg.set_value("params", "editor/scale_with_editor_scale", false)
	cfg.set_value("params", "editor/convert_colors_with_editor_theme", false)
	cfg.save(png_res_path + ".import")


# ─── SpriteFrames creation (runs after texture import completes) ──────────────

func _on_files_reimported(files: PackedStringArray) -> void:
	for file in files:
		if not _pending_spriteframes.has(file):
			continue
		var pending: Dictionary = _pending_spriteframes[file]
		_pending_spriteframes.erase(file)
		_build_spriteframes(
			String(pending["slug"]),
			String(pending["base"]),
			String(pending["sf_path"]),
			pending["png_bytes"] as PackedByteArray,
			pending["metadata"] as Dictionary,
		)


func _build_spriteframes(
	asset_slug: String,
	base: String,
	sf_path: String,
	png_bytes: PackedByteArray,
	meta: Dictionary,
) -> void:
	var png_res_path := "%s/%s.png" % [base, asset_slug]

	# Prefer the properly-imported CompressedTexture2D (nearest-filter / lossless)
	var texture := ResourceLoader.load(
		png_res_path, "Texture2D", ResourceLoader.CACHE_MODE_REPLACE
	) as Texture2D

	# Fallback: build an ImageTexture from the in-memory PNG bytes.
	# This is used when the texture hasn't been cached by Godot yet (first import).
	if texture == null:
		var img := Image.new()
		if img.load_png_from_buffer(png_bytes) == OK:
			texture = ImageTexture.create_from_image(img)

	if texture == null:
		_set_status(
			"Textura não encontrada após importação:\n%s\n"
			+"Tente reimportar manualmente em Project > Reimport." % png_res_path
		)
		return

	var frames := SpriteFrames.new()
	if frames.has_animation("default"):
		frames.remove_animation("default")

	var animations: Array = meta.get("animations", [])
	for anim in animations:
		var anim_name := String(anim.get("name", "idle"))
		if not frames.has_animation(anim_name):
			frames.add_animation(anim_name)
		frames.set_animation_speed(anim_name, float(anim.get("fps", 6)))
		frames.set_animation_loop(anim_name, bool(anim.get("loop", true)))

		for rect_data in (anim.get("frame_rects", []) as Array):
			var atlas := AtlasTexture.new()
			atlas.atlas = texture
			# filter_clip prevents subpixel bleeding between adjacent frames
			atlas.filter_clip = true
			atlas.region = Rect2(
				int(rect_data.get("x", 0)),
				int(rect_data.get("y", 0)),
				int(rect_data.get("w", meta.get("frame_width", 256))),
				int(rect_data.get("h", meta.get("frame_height", 256))),
			)
			# duration is stored in ms in the metadata; SpriteFrames uses seconds
			var dur_sec := float(rect_data.get("duration", 100)) / 1000.0
			frames.add_frame(anim_name, atlas, dur_sec)

	var err := ResourceSaver.save(frames, sf_path)
	if err != OK:
		_set_status(
			"Falha ao salvar SpriteFrames (código %d):\n%s" % [err, sf_path]
		)
		return

	EditorInterface.get_resource_filesystem().scan()

	var anim_names: Array = animations.map(
		func(a: Dictionary) -> String: return String(a.get("name", "?"))
	)
	_set_status(
		"Asset importado com sucesso!\n"
		+"Arquivo: %s\n"
		+"Animações: %s" % [sf_path, ", ".join(anim_names)]
	)
