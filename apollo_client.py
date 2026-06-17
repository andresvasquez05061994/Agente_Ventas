"""Cliente para la API de Apollo.io (búsqueda y enriquecimiento de contactos)."""

from __future__ import annotations

from typing import Any

import requests

from config import APOLLO_API_KEY, APOLLO_BASE_URL


class ApolloClientError(Exception):
    """Error al comunicarse con Apollo."""


class ApolloClient:
    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key = api_key or APOLLO_API_KEY
        self.base_url = (base_url or APOLLO_BASE_URL).rstrip("/")
        if not self.api_key:
            raise ApolloClientError(
                "APOLLO_API_KEY no configurada. Añádela en tu archivo .env"
            )

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "x-api-key": self.api_key,
        }

    def search_people(
        self,
        pais: str,
        cargo: str,
        keywords: str,
        page: int = 1,
        per_page: int = 25,
    ) -> dict[str, Any]:
        """
        Busca personas en Apollo según país, cargo y palabras clave.

        Usa POST mixed_people/api_search (endpoint vigente para API).
        mixed_people/search está deprecado y devuelve 422.
        """
        titles = [t.strip() for t in cargo.split(",") if t.strip()]
        keyword_parts = [k.strip() for k in keywords.split(",") if k.strip()]

        payload: dict[str, Any] = {
            "person_locations": [pais] if pais else [],
            "person_titles": titles,
            "page": page,
            "per_page": per_page,
        }
        if len(keyword_parts) == 1:
            payload["q_keywords"] = keyword_parts[0]
        elif keyword_parts:
            payload["q_keywords"] = " ".join(keyword_parts)

        url = f"{self.base_url}/mixed_people/api_search"
        response = requests.post(
            url, headers=self._headers, json=payload, timeout=60
        )
        if response.status_code == 200:
            return response.json()
        raise ApolloClientError(
            f"Apollo respondió {response.status_code}: {response.text}"
        )

    def enrich_person(self, apollo_id: str) -> dict[str, Any] | None:
        """Obtiene email y teléfono mediante people/match."""
        response = requests.post(
            f"{self.base_url}/people/match",
            headers=self._headers,
            json={"id": apollo_id, "reveal_personal_emails": False},
            timeout=60,
        )
        if response.status_code != 200:
            return None
        return response.json().get("person")

    @staticmethod
    def _extract_phone(person: dict[str, Any]) -> str | None:
        if person.get("phone_numbers"):
            numbers = person["phone_numbers"]
            if isinstance(numbers, list) and numbers:
                first = numbers[0]
                if isinstance(first, dict):
                    return first.get("sanitized_number") or first.get("raw_number")
                return str(first)
        return person.get("sanitized_phone") or person.get("phone")

    @staticmethod
    def normalize_person(raw: dict[str, Any]) -> dict[str, Any]:
        """Normaliza un registro de Apollo al formato interno de la plataforma."""
        org = raw.get("organization") or {}
        if isinstance(org, str):
            org = {"name": org}

        first = raw.get("first_name") or raw.get("first_name_obfuscated") or ""
        last = raw.get("last_name") or raw.get("last_name_obfuscated") or ""
        nombre = raw.get("name") or f"{first} {last}".strip()

        return {
            "apollo_id": raw.get("id") or raw.get("person_id"),
            "nombre": nombre,
            "cargo": raw.get("title") or raw.get("headline"),
            "empresa": org.get("name") if isinstance(org, dict) else None,
            "email": raw.get("email"),
            "telefono": ApolloClient._extract_phone(raw),
            "pais": raw.get("country") or raw.get("present_raw_address"),
            "linkedin_url": raw.get("linkedin_url"),
        }

    def check_connection(self) -> tuple[bool, str]:
        """Verifica que la API key de Apollo sea válida."""
        try:
            response = requests.post(
                f"{self.base_url}/mixed_people/api_search",
                headers=self._headers,
                json={"per_page": 1, "page": 1},
                timeout=15,
            )
            if response.status_code == 200:
                return True, "Conexión exitosa con Apollo"
            if response.status_code == 401:
                return False, "API key inválida o expirada"
            if response.status_code == 403:
                return False, "Acceso denegado — revisa tu plan de Apollo"
            return False, f"Error {response.status_code}: {response.text[:120]}"
        except requests.RequestException as exc:
            return False, f"Error de red: {exc}"

    def search_and_normalize(
        self,
        pais: str,
        cargo: str,
        keywords: str,
        page: int = 1,
        per_page: int = 25,
        enrich: bool = False,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        """
        Ejecuta búsqueda y devuelve lista normalizada + metadatos de paginación.
        """
        data = self.search_people(pais, cargo, keywords, page, per_page)
        raw_people = data.get("contacts") or data.get("people") or []

        results: list[dict[str, Any]] = []
        for raw in raw_people:
            person = self.normalize_person(raw)
            if enrich and person["apollo_id"]:
                enriched = self.enrich_person(person["apollo_id"])
                if enriched:
                    person = self.normalize_person(enriched)
            results.append(person)

        pagination = data.get("pagination") or {}
        meta = {
            "page": pagination.get("page", page),
            "per_page": pagination.get("per_page", per_page),
            "total_entries": data.get("total_entries")
            or pagination.get("total_entries", len(results)),
            "total_pages": pagination.get("total_pages", 1),
        }
        return results, meta
