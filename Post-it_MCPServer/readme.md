# 🗒️ Post-it Board MCP

## ¿Qué es esto?

Post-it Board MCP es un servidor MCP (Model Context Protocol) didáctico que simula un tablero de notas adhesivas compartido. Es un ejercicio de aprendizaje para entender cómo funcionan los servidores MCP y cómo se integran con clientes y n8n.

## Capacidades

El tablero de post-its ofrece las siguientes funcionalidades a través de herramientas MCP:

### 🛠️ Herramientas Disponibles

- **`createPostit`** - Crea una nueva nota adhesiva en el tablero
  - Campos: título, descripción, autor
  - Las notas expiran automáticamente después de 10 minutos

- **`listPostits`** - Lista todas las notas activas
  - Ordenadas de más reciente a más antigua
  - Solo muestra notas que no han expirado

- **`updatePostit`** - Actualiza una nota existente por ID
  - Permite modificar título, descripción y/o autor
  - Mantiene el tiempo de expiración original

- **`deletePostit`** - Elimina una nota específica por ID

- **`clearBoard`** - Borra todas las notas del tablero inmediatamente

- **`getBoardSnapshot`** - Obtiene una vista en Markdown del estado actual del tablero
  - Útil para que agentes de IA tengan contexto rápido

### ⏱️ Características

- **Auto-expiración**: Todas las notas se eliminan automáticamente después de 10 minutos
- **Almacenamiento en memoria**: Los datos no persisten entre reinicios del servidor
- **Sesiones concurrentes**: Soporta múltiples clientes conectados simultáneamente
- **Interfaz visual**: Incluye una UI web en `http://localhost:4000/` para ver el tablero

## Arquitectura Técnica

- **Transporte**: Streamable HTTP (diseñado para clientes web)
- **SDK**: `@modelcontextprotocol/sdk`
- **Backend**: Express.js + TypeScript
- **Puerto por defecto**: 4000

## Origen del Código

Este proyecto es un ejercicio didáctico sobre el protocolo MCP. El código está basado en:

- **Routask.com MCP Server** - Servidor de gestión de agendamientos
- **Logia Hackathon MCP Servers** - [Servidores MCP del hackathon de Voice & Messaging del año pasado](https://github.com/LogIA-hackaton/Logia_Supabase_MCP)
- **Desarrollado principalmente por**: Felipe Gutierrez, GPT-5.2 y Claude Sonnet 4
- **Propósito**: Aprendizaje y experimentación con Model Context Protocol

## Instalación y Uso

### Requisitos

- Node.js 18+
- npm o yarn

### Instalación

```bash
npm install
```

### Configuración

Crea un archivo `.env`:

```env
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

### Ejecutar el servidor

```bash
npm run build
npm start
```

El servidor estará disponible en:
- **Endpoint MCP**: `http://localhost:4000/mcp`
- **Interfaz visual**: `http://localhost:4000/`
- **API REST**: `http://localhost:4000/api/postits`

## Conectar con Claude Desktop

**Nota importante**: Este servidor usa Streamable HTTP transport, que está diseñado para clientes web. Para conectarlo a Claude Desktop, necesitarías crear un wrapper stdio o usar un cliente web personalizado.

Para un ejemplo de configuración stdio, revisa la documentación de MCP.

## Endpoints Disponibles

### MCP Protocol
- `POST /mcp` - Iniciar nueva sesión MCP
- `GET /mcp` - Stream SSE para sesión existente
- `DELETE /mcp` - Terminar sesión

### REST API (para debug/UI)
- `GET /api/postits` - Lista todas las notas en formato JSON
- `GET /` - Interfaz visual del tablero
- `GET /healthz` - Health check

## Estructura de una Post-it

```typescript
{
  id: string,          // ID único (8 caracteres)
  title: string,       // Título (máx. 80 chars)
  description: string, // Descripción (máx. 500 chars)
  author: string,      // Autor (máx. 40 chars)
  createdAt: number,   // Timestamp de creación
  updatedAt: number,   // Timestamp de última actualización
  expiresAt: number    // Timestamp de expiración (createdAt + 10 min)
}
```

## Ejemplo de Uso

```javascript
// Crear una nota
await mcpClient.callTool("createPostit", {
  title: "Reunión de equipo",
  description: "Recordar preparar la presentación para el viernes",
  author: "Ana"
});

// Listar todas las notas
await mcpClient.callTool("listPostits", {});

// Obtener snapshot del tablero
await mcpClient.callTool("getBoardSnapshot", {});
```

## Limitaciones

- **Almacenamiento efímero**: Los datos se pierden al reiniciar el servidor
- **TTL fijo**: Todas las notas expiran en exactamente 10 minutos
- **Sin autenticación**: No hay control de acceso, cualquier cliente puede modificar cualquier nota
- **Sin persistencia**: No hay base de datos, todo en memoria

## Propósito Educativo

Este proyecto sirve como:

- ✅ Ejemplo de implementación de servidor MCP
- ✅ Demostración de Streamable HTTP transport
- ✅ Práctica con herramientas MCP y esquemas Zod
- ✅ Referencia para manejo de sesiones concurrentes
- ✅ Plantilla para crear servidores MCP personalizados

## Recursos Adicionales

- [Documentación oficial de MCP](https://modelcontextprotocol.io/)
- [SDK de MCP en GitHub](https://github.com/modelcontextprotocol/sdk)
- [Ejemplos de servidores MCP](https://github.com/modelcontextprotocol/servers)

## Licencia

Este es un proyecto educativo. Úsalo libremente para aprender y experimentar con MCP.

---

**⚠️ Disclaimer**: Este es un proyecto didáctico, no está diseñado para uso en producción. No hay garantías de seguridad, estabilidad o soporte continuo.
