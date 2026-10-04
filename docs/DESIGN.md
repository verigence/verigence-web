
## 27. Previous experience

An employee (or HR) records previous jobs: company, location, designation, start and end dates and
a short description (`hr.employee_experience`, several per employee). The employee manages their own
through `/me/employee/experiences`; HR through `/employees/{id}/experiences`. Both are audited, and
the list comes back as `experiences` on the employee detail. A job must have ended by today.
