"""Generic CRUD service for SQLModel models."""

from typing import Any

from sqlmodel import Session
from sqlmodel import SQLModel
from sqlmodel import select

type ModelType = SQLModel
type CreateSchemaType = SQLModel
type UpdateSchemaType = SQLModel


class CRUDService[ModelType, CreateSchemaType, UpdateSchemaType]:
    """Generic CRUD operations for SQLModel models."""

    def __init__(self, model: type[ModelType]) -> None:
        """Initialize CRUD service with a model class."""
        self.model = model

    def get(self, session: Session, id: Any) -> ModelType | None:
        """Get a single record by ID."""
        return session.get(self.model, id)

    def get_multi(
        self, session: Session, *, skip: int = 0, limit: int = 100, **filters: Any
    ) -> list[ModelType]:
        """Get multiple records with optional filtering."""
        statement = select(self.model)

        for key, value in filters.items():
            if value is not None and hasattr(self.model, key):
                statement = statement.where(getattr(self.model, key) == value)

        statement = statement.offset(skip).limit(limit)
        return list(session.exec(statement).all())

    def create(self, session: Session, *, obj_in: CreateSchemaType, **extra: Any) -> ModelType:
        """Create a new record."""
        db_obj = self.model.model_validate(obj_in, update=extra)
        session.add(db_obj)
        session.commit()
        session.refresh(db_obj)
        return db_obj

    def update(
        self, session: Session, *, db_obj: ModelType, obj_in: UpdateSchemaType | dict[str, Any]
    ) -> ModelType:
        """Update an existing record."""
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)

        db_obj.sqlmodel_update(update_data)
        session.add(db_obj)
        session.commit()
        session.refresh(db_obj)
        return db_obj

    def delete(self, session: Session, *, id: Any) -> ModelType | None:
        """Delete a record by ID."""
        obj = session.get(self.model, id)
        if obj:
            session.delete(obj)
            session.commit()
        return obj

    def get_by_field(self, session: Session, field: str, value: Any) -> ModelType | None:
        """Get a single record by any field."""
        if not hasattr(self.model, field):
            return None

        statement = select(self.model).where(getattr(self.model, field) == value)
        return session.exec(statement).first()

    def count(self, session: Session, **filters: Any) -> int:
        """Count records with optional filtering."""
        statement = select(self.model)

        for key, value in filters.items():
            if value is not None and hasattr(self.model, key):
                statement = statement.where(getattr(self.model, key) == value)

        return len(list(session.exec(statement).all()))
