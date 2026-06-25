@tool
extends EditorPlugin

var dock: VBoxContainer
var prompt_text: TextEdit
var bridge_url: LineEdit
var token_text: LineEdit
var status_label: Label
var asset_name: LineEdit
var animation_name: LineEdit
var assets_list: OptionButton
var preview_rect: TextureRect
var http: HTTPRequest
var last_metadata: Dictionary = {}
var request_kind := ""
var asset_ids: Array[String] = []
var pending_png_path := ""
var selected_asset_id := ""

func _enter_tree() -> void:
	dock = VBoxContainer.new()
	dock.name = "Pixel Art MCP"
	dock.custom_minimum_size = Vector2(320, 0)

	var title := Label.new()
	title.text = "Pixel Art MCP"
	title.add_theme_font_size_override("font_size", 18)
	dock.add_child(title)

	bridge_url = LineEdit.new()
	bridge_url.text = "http://127.0.0.1:8787"
	bridge_url.placeholder_text = "Bridge URL"
	dock.add_child(bridge_url)

	token_text = LineEdit.new()
	token_text.placeholder_text = "Token opcional da bridge"
	token_text.secret = true
	dock.add_child(token_text)

	prompt_text = TextEdit.new()
	prompt_text.custom_minimum_size = Vector2(0, 96)
	prompt_text.placeholder_text = "Ex.: crie personagem idle oeste fantasia feudal sombria"
	dock.add_child(prompt_text)

	var generate_button := Button.new()
	generate_button.text = "Gerar / aplicar prompt"
	generate_button.pressed.connect(_request_generate)
	dock.add_child(generate_button)

	var assets_button := Button.new()
	assets_button.text = "Listar assets da bridge"
	assets_button.pressed.connect(_request_assets)
	dock.add_child(assets_button)

	assets_list = OptionButton.new()
	assets_list.item_selected.connect(_on_asset_selected)
	dock.add_child(assets_list)

	var preview_png_button := Button.new()
	preview_png_button.text = "Exibir preview"
	preview_png_button.pressed.connect(_request_preview)
	dock.add_child(preview_png_button)

	preview_rect = TextureRect.new()
	preview_rect.custom_minimum_size = Vector2(128, 128)
	preview_rect.expand_mode = TextureRect.EXPAND_FIT_WIDTH_PROPORTIONAL
	preview_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	dock.add_child(preview_rect)

	var preview_button := Button.new()
	preview_button.text = "Atualizar metadata do bridge"
	preview_button.pressed.connect(_request_metadata)
	dock.add_child(preview_button)

	asset_name = LineEdit.new()
	asset_name.placeholder_text = "asset, ex.: herdeiro_valdren"
	dock.add_child(asset_name)

	animation_name = LineEdit.new()
	animation_name.placeholder_text = "animation, ex.: idle_w"
	dock.add_child(animation_name)

	var import_button := Button.new()
	import_button.text = "Importar asset completo"
	import_button.pressed.connect(_request_import_asset)
	dock.add_child(import_button)

	status_label = Label.new()
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status_label.text = "Bridge local esperado em 127.0.0.1:8787."
	dock.add_child(status_label)

	http = HTTPRequest.new()
	dock.add_child(http)
	http.request_completed.connect(_on_request_completed)

	add_control_to_dock(DOCK_SLOT_RIGHT_UL, dock)

func _exit_tree() -> void:
	if dock:
		remove_control_from_docks(dock)
		dock.free()

func _request_generate() -> void:
	request_kind = "generate"
	var url := _endpoint("/api/ai-prompt")
	var body := JSON.stringify({"prompt": prompt_text.text, "operation": "generate"})
	status_label.text = "Enviando prompt..."
	http.request(url, _headers(["Content-Type: application/json"]), HTTPClient.METHOD_POST, body)

func _request_assets() -> void:
	request_kind = "assets"
	status_label.text = "Lendo assets..."
	http.request(_endpoint("/api/assets"), _headers())

func _request_preview() -> void:
	request_kind = "preview"
	status_label.text = "Baixando preview..."
	http.request(_endpoint("/api/preview.png"), _headers())

func _request_metadata() -> void:
	request_kind = "metadata"
	status_label.text = "Lendo metadata Godot..."
	http.request(_endpoint("/api/export/godot"), _headers())

func _request_import_asset() -> void:
	request_kind = "import_metadata"
	status_label.text = "Importando metadata..."
	http.request(_endpoint("/api/export/godot"), _headers())

func _request_import_spritesheet() -> void:
	request_kind = "import_spritesheet"
	status_label.text = "Baixando spritesheet..."
	http.request(_endpoint("/api/godot/spritesheet.png"), _headers())

func _endpoint(path:String) -> String:
	return bridge_url.text.strip_edges().trim_suffix("/") + path

func _headers(extra:Array = []) -> PackedStringArray:
	var headers := PackedStringArray()
	for h in extra:
		headers.append(String(h))
	var token := token_text.text.strip_edges()
	if token != "":
		headers.append("x-pixel-token: %s" % token)
	return headers

func _on_request_completed(result:int, response_code:int, headers:PackedStringArray, body:PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
		status_label.text = "Falha HTTP: %s / %s" % [result, response_code]
		return
	if request_kind == "preview":
		_apply_preview(body)
		return
	if request_kind == "import_spritesheet":
		_finish_import_spritesheet(body)
		return
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY:
		if request_kind == "assets" and typeof(parsed) == TYPE_ARRAY:
			_apply_assets(parsed)
		else:
			status_label.text = "Resposta JSON inválida."
		return
	if request_kind == "assets":
		_apply_assets(parsed)
	elif parsed.has("animations"):
		last_metadata = parsed
		_apply_metadata_fields()
		if request_kind == "import_metadata":
			_write_metadata(last_metadata)
			_request_import_spritesheet()
		else:
			status_label.text = "Metadata carregada."
	elif parsed.has("godot") or parsed.has("frames"):
		if request_kind == "set_active_asset":
			status_label.text = "Asset ativo atualizado."
			_request_metadata()
		else:
			status_label.text = "Projeto atualizado no bridge. Clique em atualizar metadata."
	else:
		status_label.text = "Resposta recebida."

func _apply_assets(parsed) -> void:
	assets_list.clear()
	asset_ids.clear()
	var assets: Array = parsed if typeof(parsed) == TYPE_ARRAY else []
	for asset in assets:
		if typeof(asset) != TYPE_DICTIONARY:
			continue
		var name := String(asset.get("name", "asset"))
		var id := String(asset.get("id", name))
		asset_ids.append(id)
		var animations: Array = asset.get("animations", [])
		assets_list.add_item("%s (%s animações)" % [name, animations.size()])
	status_label.text = "Assets encontrados: %s" % asset_ids.size()

func _on_asset_selected(index:int) -> void:
	if index < 0 or index >= asset_ids.size():
		return
	selected_asset_id = asset_ids[index]
	request_kind = "set_active_asset"
	status_label.text = "Selecionando asset: %s" % selected_asset_id
	http.request(
		_endpoint("/api/tools/set-active-asset"),
		_headers(["Content-Type: application/json"]),
		HTTPClient.METHOD_POST,
		JSON.stringify({"asset": selected_asset_id})
	)

func _apply_metadata_fields() -> void:
	asset_name.text = String(last_metadata.get("asset", asset_name.text))
	var animations: Array = last_metadata.get("animations", [])
	if not animations.is_empty():
		animation_name.text = String(animations[0].get("name", animation_name.text))

func _apply_preview(body:PackedByteArray) -> void:
	var image := Image.new()
	var err := image.load_png_from_buffer(body)
	if err != OK:
		status_label.text = "Preview PNG inválido: %s" % err
		return
	preview_rect.texture = ImageTexture.create_from_image(image)
	status_label.text = "Preview atualizado."

func _asset_dir(data:Dictionary) -> String:
	return "res://assets/%s" % String(data.get("asset", "pixel_asset"))

func _globalize_res_path(res_path:String) -> String:
	return ProjectSettings.globalize_path(res_path)

func _write_metadata(data:Dictionary) -> void:
	var asset_dir := _asset_dir(data)
	var metadata_dir := asset_dir + "/metadata"
	DirAccess.make_dir_recursive_absolute(_globalize_res_path(metadata_dir))
	var metadata_path := String(data.get("files", {}).get("metadata", "%s/%s.animations.json" % [metadata_dir, data.get("asset", "pixel_asset")]))
	var atlas_path := String(data.get("files", {}).get("atlas", "%s/%s_%s.atlas.json" % [metadata_dir, data.get("asset", "pixel_asset"), data.get("active_animation", "idle")]))
	var metadata_file := FileAccess.open(metadata_path, FileAccess.WRITE)
	metadata_file.store_string(JSON.stringify(data, "\t"))
	var atlas_file := FileAccess.open(atlas_path, FileAccess.WRITE)
	atlas_file.store_string(JSON.stringify({"meta": data.get("sheet", {}), "animations": data.get("animations", [])}, "\t"))

func _finish_import_spritesheet(body:PackedByteArray) -> void:
	if last_metadata.is_empty():
		status_label.text = "Metadata ausente para spritesheet."
		return
	var asset_dir := _asset_dir(last_metadata)
	var sheet_path := String(last_metadata.get("files", {}).get("asset_spritesheet", "%s/spritesheets/%s_sheet.png" % [asset_dir, last_metadata.get("asset", "pixel_asset")]))
	DirAccess.make_dir_recursive_absolute(_globalize_res_path(sheet_path.get_base_dir()))
	var file := FileAccess.open(sheet_path, FileAccess.WRITE)
	file.store_buffer(body)
	pending_png_path = sheet_path
	_apply_pixel_perfect_settings(sheet_path)
	EditorInterface.get_resource_filesystem().scan()
	_create_spriteframes(last_metadata, body)

func _apply_pixel_perfect_settings(sheet_path:String) -> void:
	ProjectSettings.set_setting("rendering/textures/canvas_textures/default_texture_filter", 0)
	ProjectSettings.save()
	var settings_path := sheet_path + ".pixel_art_import.json"
	var file := FileAccess.open(settings_path, FileAccess.WRITE)
	file.store_string(JSON.stringify(last_metadata.get("import", {}), "\t"))

func _create_spriteframes_from_metadata() -> void:
	if last_metadata.is_empty():
		var path := "res://assets/%s/metadata/%s.animations.json" % [asset_name.text.strip_edges(), asset_name.text.strip_edges()]
		if not FileAccess.file_exists(path):
			status_label.text = "Metadata não carregada e arquivo não encontrado: %s" % path
			return
		var file := FileAccess.open(path, FileAccess.READ)
		last_metadata = JSON.parse_string(file.get_as_text())
		if typeof(last_metadata) != TYPE_DICTIONARY:
			status_label.text = "JSON inválido."
			return
	_create_spriteframes(last_metadata)

func _create_spriteframes(data:Dictionary, png_bytes:PackedByteArray = PackedByteArray()) -> void:
	var frames := SpriteFrames.new()
	var texture_path := String(data.get("files", {}).get("asset_spritesheet", data.get("files", {}).get("spritesheet", "")))
	var texture := load(texture_path) as Texture2D
	if texture == null and not png_bytes.is_empty():
		var image := Image.new()
		if image.load_png_from_buffer(png_bytes) == OK:
			texture = ImageTexture.create_from_image(image)
	if texture == null:
		status_label.text = "Textura não encontrada: %s" % texture_path
		return
	for anim in data.get("animations", []):
		var anim_name := String(anim.get("name", "idle"))
		if not frames.has_animation(anim_name):
			frames.add_animation(anim_name)
		frames.set_animation_speed(anim_name, float(anim.get("fps", 6)))
		frames.set_animation_loop(anim_name, bool(anim.get("loop", true)))
		for rect_data in anim.get("frame_rects", []):
			var atlas := AtlasTexture.new()
			atlas.atlas = texture
			atlas.region = Rect2(
				int(rect_data.get("x", 0)),
				int(rect_data.get("y", 0)),
				int(rect_data.get("w", data.get("frame_width", 256))),
				int(rect_data.get("h", data.get("frame_height", 256)))
			)
			frames.add_frame(anim_name, atlas, float(rect_data.get("duration", 100)) / 1000.0)
	var asset := String(data.get("asset", "pixel_asset"))
	var output_dir := "res://assets/%s" % asset
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_dir))
	var output_path := "%s/%s.spriteframes.tres" % [output_dir, asset]
	var err := ResourceSaver.save(frames, output_path)
	if err == OK:
		EditorInterface.get_resource_filesystem().scan()
		status_label.text = "Asset importado: %s" % output_path
	else:
		status_label.text = "Falha ao salvar SpriteFrames: %s" % err
