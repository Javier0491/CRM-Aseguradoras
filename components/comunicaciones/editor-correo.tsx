"use client";

import * as React from "react";
import { Image } from "@tiptap/extension-image";
import { TextAlign } from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Heading3,
  ImageIcon,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  UserRound,
} from "lucide-react";

import { MAX_BYTES_IMAGEN, TIPOS_IMAGEN, VARIABLE_NOMBRE } from "@/lib/comunicaciones/correo";
import { cn } from "@/lib/utils";

const COLORES = [
  { nombre: "Texto", valor: "" },
  { nombre: "Dorado", valor: "#8c7340" },
  { nombre: "Azul", valor: "#1d4ed8" },
  { nombre: "Verde", valor: "#15803d" },
  { nombre: "Rojo", valor: "#b91c1c" },
  { nombre: "Gris", valor: "#71717a" },
];

function leerComoDataUrl(archivo: File) {
  return new Promise<string>((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(archivo);
  });
}

export function EditorCorreo({
  contenidoInicial,
  onChange,
  onError,
}: {
  contenidoInicial: string;
  onChange: (html: string) => void;
  onError: (mensaje: string) => void;
}) {
  const editor = useEditor({
    // Evita desajustes de hidratación: el editor solo se monta en el navegador.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      // En línea para que las imágenes se puedan alinear junto con su párrafo.
      Image.configure({ inline: true, allowBase64: true }),
    ],
    content: contenidoInicial,
    editorProps: {
      attributes: {
        class: "correo-editor min-h-80 px-5 py-4 text-sm leading-relaxed outline-none",
        "aria-label": "Cuerpo del correo",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  return (
    <div className="overflow-hidden rounded-lg border bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
      {editor ? <BarraHerramientas editor={editor} onError={onError} /> : <div className="h-11 border-b" />}
      <EditorContent editor={editor} />
    </div>
  );
}

function BarraHerramientas({ editor, onError }: { editor: Editor; onError: (mensaje: string) => void }) {
  const archivoRef = React.useRef<HTMLInputElement>(null);
  const estado = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      izquierda: e.isActive({ textAlign: "left" }),
      centro: e.isActive({ textAlign: "center" }),
      derecha: e.isActive({ textAlign: "right" }),
      color: (e.getAttributes("textStyle").color as string | undefined) ?? "",
      deshacer: e.can().undo(),
      rehacer: e.can().redo(),
    }),
  });

  const cadena = () => editor.chain().focus();

  function enlace() {
    const anterior = (editor.getAttributes("link").href as string | undefined) ?? "https://";
    const url = window.prompt("Dirección del enlace (déjala vacía para quitarlo):", anterior);
    if (url === null) return;
    if (url.trim() === "") {
      cadena().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(url.trim())) {
      onError("El enlace debe empezar con https://, mailto: o tel:.");
      return;
    }
    cadena().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  function imagenPorUrl() {
    const url = window.prompt("URL pública de la imagen (https://…):");
    if (!url) return;
    if (!/^https:\/\//i.test(url.trim())) {
      onError("La URL de la imagen debe empezar con https://.");
      return;
    }
    cadena().setImage({ src: url.trim() }).run();
  }

  async function subirImagen(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    if (!(TIPOS_IMAGEN as readonly string[]).includes(archivo.type)) {
      onError("Usa imágenes PNG, JPG o GIF (son los formatos que muestran todos los clientes de correo).");
      return;
    }
    if (archivo.size > MAX_BYTES_IMAGEN) {
      onError("La imagen pesa más de 2 MB. Redúcela antes de insertarla.");
      return;
    }
    const src = await leerComoDataUrl(archivo);
    cadena().setImage({ src, alt: archivo.name.replace(/\.[^.]+$/, "") }).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-2 py-1.5">
      <Boton titulo="Deshacer" onClick={() => cadena().undo().run()} disabled={!estado.deshacer}>
        <Undo2 />
      </Boton>
      <Boton titulo="Rehacer" onClick={() => cadena().redo().run()} disabled={!estado.rehacer}>
        <Redo2 />
      </Boton>
      <Separador />
      <Boton titulo="Título" activo={estado.h2} onClick={() => cadena().toggleHeading({ level: 2 }).run()}>
        <Heading2 />
      </Boton>
      <Boton titulo="Subtítulo" activo={estado.h3} onClick={() => cadena().toggleHeading({ level: 3 }).run()}>
        <Heading3 />
      </Boton>
      <Separador />
      <Boton titulo="Negritas" activo={estado.bold} onClick={() => cadena().toggleBold().run()}>
        <Bold />
      </Boton>
      <Boton titulo="Cursivas" activo={estado.italic} onClick={() => cadena().toggleItalic().run()}>
        <Italic />
      </Boton>
      <Boton titulo="Subrayado" activo={estado.underline} onClick={() => cadena().toggleUnderline().run()}>
        <Underline />
      </Boton>
      <Boton titulo="Tachado" activo={estado.strike} onClick={() => cadena().toggleStrike().run()}>
        <Strikethrough />
      </Boton>
      <select
        aria-label="Color del texto"
        title="Color del texto"
        value={estado.color}
        onChange={(e) =>
          e.target.value ? cadena().setColor(e.target.value).run() : cadena().unsetColor().run()
        }
        className="h-7 rounded-md border bg-background px-1.5 text-xs"
        style={estado.color ? { color: estado.color } : undefined}
      >
        {COLORES.map((c) => (
          <option key={c.nombre} value={c.valor}>
            {c.nombre}
          </option>
        ))}
      </select>
      <Separador />
      <Boton titulo="Alinear a la izquierda" activo={estado.izquierda} onClick={() => cadena().setTextAlign("left").run()}>
        <AlignLeft />
      </Boton>
      <Boton titulo="Centrar" activo={estado.centro} onClick={() => cadena().setTextAlign("center").run()}>
        <AlignCenter />
      </Boton>
      <Boton titulo="Alinear a la derecha" activo={estado.derecha} onClick={() => cadena().setTextAlign("right").run()}>
        <AlignRight />
      </Boton>
      <Separador />
      <Boton titulo="Lista con viñetas" activo={estado.bullet} onClick={() => cadena().toggleBulletList().run()}>
        <List />
      </Boton>
      <Boton titulo="Lista numerada" activo={estado.ordered} onClick={() => cadena().toggleOrderedList().run()}>
        <ListOrdered />
      </Boton>
      <Boton titulo="Cita" activo={estado.quote} onClick={() => cadena().toggleBlockquote().run()}>
        <Quote />
      </Boton>
      <Boton titulo="Línea divisoria" onClick={() => cadena().setHorizontalRule().run()}>
        <Minus />
      </Boton>
      <Separador />
      <Boton titulo="Enlace" activo={estado.link} onClick={enlace}>
        <Link2 />
      </Boton>
      <Boton titulo="Insertar imagen o logo desde tu equipo" onClick={() => archivoRef.current?.click()}>
        <ImagePlus />
      </Boton>
      <Boton titulo="Insertar imagen desde una URL" onClick={imagenPorUrl}>
        <ImageIcon />
      </Boton>
      <input
        ref={archivoRef}
        type="file"
        accept={TIPOS_IMAGEN.join(",")}
        className="hidden"
        onChange={subirImagen}
      />
      <Separador />
      <button
        type="button"
        title="Insertar el nombre de cada cliente"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => cadena().insertContent(VARIABLE_NOMBRE).run()}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/30 bg-primary/[0.06] px-2 font-mono text-xs text-primary hover:bg-primary/[0.12]"
      >
        <UserRound className="size-3.5" /> {VARIABLE_NOMBRE}
      </button>
    </div>
  );
}

function Boton({
  titulo,
  activo,
  disabled,
  onClick,
  children,
}: {
  titulo: string;
  activo?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      aria-pressed={activo}
      disabled={disabled}
      // Evita que el botón robe el foco y se pierda la selección del editor.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4",
        activo && "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
      )}
    >
      {children}
    </button>
  );
}

function Separador() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden />;
}
