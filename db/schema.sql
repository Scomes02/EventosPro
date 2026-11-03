-- EventosPro · esquema PostgreSQL
-- Migración 1:1 del esquema normalizado original en MySQL (eventos_db).
-- Únicos cambios: cliente.password_hash (login con contraseña real) y nombres sin "ñ"
-- en resenas (id_resena / fecha_resena) para evitar comillas en todas las consultas.

DROP TABLE IF EXISTS resenas, descuentos, compra_metodo_pago, metodo_pago,
  entrada, detalle_compra, compra, cliente, evento, sector, recinto, ciudad,
  provincia, artista_genero, genero, artista CASCADE;

CREATE TABLE artista (
  id_artista  SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL
);

CREATE TABLE genero (
  id_genero   SERIAL PRIMARY KEY,
  nombre      VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE artista_genero (
  id_artista  INT NOT NULL REFERENCES artista(id_artista) ON DELETE CASCADE ON UPDATE CASCADE,
  id_genero   INT NOT NULL REFERENCES genero(id_genero)   ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (id_artista, id_genero)
);

CREATE TABLE provincia (
  id_provincia SERIAL PRIMARY KEY,
  nombre       VARCHAR(100) NOT NULL
);

CREATE TABLE ciudad (
  id_ciudad    SERIAL PRIMARY KEY,
  nombre       VARCHAR(100),
  id_provincia INT REFERENCES provincia(id_provincia) ON DELETE SET NULL ON UPDATE CASCADE,
  pais         VARCHAR(100),
  CONSTRAINT uq_ciudad UNIQUE (nombre, pais)
);

CREATE TABLE recinto (
  id_recinto  SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  direccion   VARCHAR(150),
  id_ciudad   INT REFERENCES ciudad(id_ciudad)
);

CREATE TABLE sector (
  id_sector        SERIAL PRIMARY KEY,
  id_recinto       INT REFERENCES recinto(id_recinto),
  nombre_sector    VARCHAR(100),
  capacidad_sector INT,
  precio_base      NUMERIC(10,2)
);

CREATE TABLE evento (
  id_evento    SERIAL PRIMARY KEY,
  nombre       VARCHAR(100) NOT NULL,
  descripcion  TEXT,
  fecha_inicio DATE NOT NULL,
  fecha_fin    DATE NOT NULL,
  id_recinto   INT REFERENCES recinto(id_recinto),
  id_artista   INT REFERENCES artista(id_artista)
);

CREATE TABLE cliente (
  id_cliente    SERIAL PRIMARY KEY,
  nombre        VARCHAR(100) NOT NULL,
  apellido      VARCHAR(100),
  dni           VARCHAR(20) UNIQUE,
  email         VARCHAR(100) UNIQUE,
  telefono      VARCHAR(20),
  password_hash VARCHAR(100)          -- nuevo: bcrypt
);

CREATE TABLE metodo_pago (
  id_metodo_pago SERIAL PRIMARY KEY,
  nombre         VARCHAR(50) NOT NULL,
  descripcion    VARCHAR(100)
);

CREATE TABLE compra (
  id_compra    SERIAL PRIMARY KEY,
  id_cliente   INT REFERENCES cliente(id_cliente),
  fecha_compra DATE NOT NULL,
  monto_total  NUMERIC(10,2),
  estado       VARCHAR(10) NOT NULL DEFAULT 'pendiente'
               CHECK (estado IN ('pendiente','pagada','cancelada'))
);

CREATE TABLE compra_metodo_pago (
  id_compra      INT NOT NULL REFERENCES compra(id_compra) ON DELETE CASCADE ON UPDATE CASCADE,
  id_metodo_pago INT NOT NULL REFERENCES metodo_pago(id_metodo_pago) ON DELETE CASCADE ON UPDATE CASCADE,
  monto_pagado   NUMERIC(10,2) DEFAULT 0,
  PRIMARY KEY (id_compra, id_metodo_pago)
);

CREATE TABLE detalle_compra (
  id_detalle      SERIAL PRIMARY KEY,
  id_compra       INT REFERENCES compra(id_compra),
  id_entrada      INT UNIQUE,
  precio_unitario NUMERIC(10,2)
);

CREATE TABLE entrada (
  id_entrada     SERIAL PRIMARY KEY,
  id_evento      INT REFERENCES evento(id_evento),
  id_sector      INT REFERENCES sector(id_sector),
  fila           VARCHAR(10),
  numero_asiento INT,
  precio_final   NUMERIC(10,2),
  estado         VARCHAR(10) NOT NULL DEFAULT 'disponible'
                 CHECK (estado IN ('disponible','vendida','reservada')),
  id_detalle     INT REFERENCES detalle_compra(id_detalle),
  CONSTRAINT uq_butaca_por_evento UNIQUE (id_evento, id_sector, fila, numero_asiento)
);
CREATE INDEX idx_entrada_evento ON entrada(id_evento);

ALTER TABLE detalle_compra
  ADD CONSTRAINT fk_detalle_entrada FOREIGN KEY (id_entrada) REFERENCES entrada(id_entrada);
CREATE INDEX idx_detalle_compra ON detalle_compra(id_compra);

CREATE TABLE descuentos (
  id_descuento SERIAL PRIMARY KEY,
  porcentaje   NUMERIC(5,2),
  id_detalle   INT REFERENCES detalle_compra(id_detalle) ON DELETE CASCADE ON UPDATE CASCADE,
  fecha_inicio DATE,
  fecha_fin    DATE
);

CREATE TABLE resenas (
  id_resena    SERIAL PRIMARY KEY,
  id_evento    INT REFERENCES evento(id_evento),
  id_cliente   INT REFERENCES cliente(id_cliente),
  puntuacion   INT CHECK (puntuacion BETWEEN 1 AND 5),
  comentario   VARCHAR(255),
  fecha_resena DATE
);
