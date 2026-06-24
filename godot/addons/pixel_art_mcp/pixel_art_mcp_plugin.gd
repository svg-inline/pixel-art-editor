@tool
extends EditorPlugin

var dock: VBoxContainer
var prompt_text: TextEdit
var bridge_url: LineEdit
var status_label: Label
var asset_name: LineEdit
var animation_name: LineEdit
var http: HTTPRequest
var last_metadata: Dictionary = {}

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

	prompt_text = TextEdit.new()
	prompt_text.custom_minimum_size = Vector2(0, 96)
	prompt_text.placeholder_text = "Ex.: crie personagem idle oeste fantasia feudal sombria"
	dock.add_child(prompt_text)

	var generate_button := Button.new()
	generate_button.text = "Gerar / aplicar prompt"
	generate_button.pressed.connect(_request_generate)
	dock.add_child(generate_button)

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
	import_button.text = "Criar SpriteFrames do JSON/PNG"
	import_button.pressed.connect(_create_spriteframes_from_metadata)
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
	var url := bridge_url.text.strip_edges() + "/api/ai-prompt"
	var body := JSON.stringify({"prompt": prompt_text.text, "operation": "generate"})
	status_label.text = "Enviando prompt..."
	http.request(url, ["Content-Type: application/json"], HTTPClient.METHOD_POST, body)

func _request_metadata() -> void:
	status_label.text = "Lendo metadata Godot..."
	http.request(bridge_url.text.strip_edges() + "/api/export/godot")

func _on_request_completed(result:int, response_code:int, headers:PackedStringArray, body:PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
		status_label.text = "Falha HTTP: %s / %s" % [result, response_code]
		return
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY:
		status_label.text = "Resposta JSON inválida."
		return
	if parsed.has("animations"):
		last_metadata = parsed
		_apply_metadata_fields()
		status_label.text = "Metadata carregada."
	elif parsed.has("godot") or parsed.has("frames"):
		status_label.text = "Projeto atualizado no bridge. Clique em atualizar metadata."
	else:
		status_label.text = "Resposta recebida."

func _apply_metadata_fields() -> void:
	asset_name.text = String(last_metadata.get("asset", asset_name.text))
	var animations: Array = last_metadata.get("animations", [])
	if not animations.is_empty():
		animation_name.text = String(animations[0].get("name", animation_name.text))

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

func _create_spriteframes(data:Dictionary) -> void:
	var frames := SpriteFrames.new()
	var texture_path := String(data.get("files", {}).get("spritesheet", ""))
	var texture := load(texture_path) as Texture2D
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
		status_label.text = "SpriteFrames criado: %s" % output_path
	else:
		status_label.text = "Falha ao salvar SpriteFrames: %s" % err
