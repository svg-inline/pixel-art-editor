@tool
extends EditorScript

# Uso:
# 1. Coloque o JSON exportado em res://assets/<asset>/metadata/<asset>.animations.json
# 2. Ajuste METADATA_PATH.
# 3. Rode este EditorScript no Godot 4.
# Ele cria um SpriteFrames .tres simples baseado no spritesheet informado no JSON.

const METADATA_PATH := "res://assets/pixel_asset/metadata/pixel_asset.animations.json"

func _run() -> void:
	if not FileAccess.file_exists(METADATA_PATH):
		push_error("Metadata não encontrado: %s" % METADATA_PATH)
		return

	var file := FileAccess.open(METADATA_PATH, FileAccess.READ)
	var data = JSON.parse_string(file.get_as_text())
	if typeof(data) != TYPE_DICTIONARY:
		push_error("JSON inválido.")
		return

	var frames := SpriteFrames.new()
	for anim in data.get("animations", []):
		var anim_name := String(anim.get("name", "idle"))
		frames.add_animation(anim_name)
		frames.set_animation_speed(anim_name, float(anim.get("fps", 6)))
		frames.set_animation_loop(anim_name, bool(anim.get("loop", true)))

		var texture_path := String(data.get("files", {}).get("spritesheet", ""))
		var texture := load(texture_path) as Texture2D
		if texture == null:
			push_error("Textura não encontrada: %s" % texture_path)
			continue

		for rect_data in anim.get("frame_rects", []):
			var atlas := AtlasTexture.new()
			atlas.atlas = texture
			atlas.region = Rect2(
				int(rect_data.get("x", 0)),
				int(rect_data.get("y", 0)),
				int(rect_data.get("w", data.get("frame_width", 256))),
				int(rect_data.get("h", data.get("frame_height", 256)))
			)
			frames.add_frame(anim_name, atlas)

	var asset := String(data.get("asset", "pixel_asset"))
	var output_path := "res://assets/%s/%s.spriteframes.tres" % [asset, asset]
	var err := ResourceSaver.save(frames, output_path)
	if err != OK:
		push_error("Falha ao salvar SpriteFrames: %s" % err)
	else:
		print("SpriteFrames criado: ", output_path)
